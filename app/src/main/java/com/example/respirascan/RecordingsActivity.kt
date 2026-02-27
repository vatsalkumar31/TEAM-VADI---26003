package com.example.respirascan

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class RecordingsActivity : AppCompatActivity() {

    private var mediaPlayer: MediaPlayer? = null
    private var playingPosition: Int = -1
    private val handler = Handler(Looper.getMainLooper())
    private var updateSeekBar: Runnable? = null

    private lateinit var rvRecordings: RecyclerView
    private lateinit var adapter: RecordingsAdapter
    private var recordingsList = mutableListOf<File>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_recordings)

        rvRecordings = findViewById(R.id.rvRecordings)
        rvRecordings.layoutManager = LinearLayoutManager(this)

        loadRecordings()
    }

    private fun loadRecordings() {
        val recordingsDir = externalCacheDir ?: filesDir
        recordingsList = recordingsDir.listFiles()?.filter {
            it.extension == "3gp" || it.extension == "mp4"
        }?.sortedByDescending { it.lastModified() }?.toMutableList() ?: mutableListOf()

        adapter = RecordingsAdapter(recordingsList)
        rvRecordings.adapter = adapter
    }

    private fun togglePlay(file: File, position: Int) {
        if (playingPosition == position && mediaPlayer?.isPlaying == true) {
            mediaPlayer?.pause()
            adapter.notifyItemChanged(position)
            return
        }

        if (playingPosition == position && mediaPlayer != null) {
            mediaPlayer?.start()
            adapter.notifyItemChanged(position)
            return
        }

        stopPlayback()
        playingPosition = position
        
        mediaPlayer = MediaPlayer().apply {
            try {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                setDataSource(file.absolutePath)
                prepare()
                start()
                adapter.notifyDataSetChanged()

                setOnCompletionListener {
                    stopPlayback()
                }
            } catch (e: IOException) {
                Toast.makeText(this@RecordingsActivity, "Playback failed", Toast.LENGTH_SHORT).show()
                playingPosition = -1
                adapter.notifyDataSetChanged()
            }
        }
    }

    private fun stopPlayback() {
        handler.removeCallbacks(updateSeekBar ?: return)
        mediaPlayer?.release()
        mediaPlayer = null
        val oldPos = playingPosition
        playingPosition = -1
        if (oldPos != -1) adapter.notifyItemChanged(oldPos)
    }

    private fun deleteFile(file: File, position: Int) {
        if (playingPosition == position) stopPlayback()
        if (file.delete()) {
            recordingsList.removeAt(position)
            adapter.notifyItemRemoved(position)
            Toast.makeText(this, "File Deleted", Toast.LENGTH_SHORT).show()
        }
    }

    private fun formatTime(ms: Int): String {
        val totalSeconds = ms / 1000
        val minutes = totalSeconds / 60
        val seconds = totalSeconds % 60
        return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds)
    }

    inner class RecordingsAdapter(private val files: MutableList<File>) : 
        RecyclerView.Adapter<RecordingsAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val tvFileName: TextView = view.findViewById(R.id.tvFileName)
            val tvDate: TextView = view.findViewById(R.id.tvDate)
            val btnPlay: ImageButton = view.findViewById(R.id.btnPlay)
            val btnDelete: ImageButton = view.findViewById(R.id.btnDelete)
            val playerControls: View = view.findViewById(R.id.playerControls)
            val seekBar: SeekBar = view.findViewById(R.id.seekBar)
            val tvCurrentTime: TextView = view.findViewById(R.id.tvCurrentTime)
            val tvTotalDuration: TextView = view.findViewById(R.id.tvTotalDuration)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context).inflate(R.layout.item_recording, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val file = files[position]
            holder.tvFileName.text = file.name
            val sdf = SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.getDefault())
            holder.tvDate.text = sdf.format(Date(file.lastModified()))

            val isPlayingThis = (playingPosition == position)
            holder.playerControls.visibility = if (isPlayingThis) View.VISIBLE else View.GONE
            
            val icon = if (isPlayingThis && mediaPlayer?.isPlaying == true) 
                android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
            holder.btnPlay.setImageResource(icon)

            if (isPlayingThis && mediaPlayer != null) {
                val duration = mediaPlayer!!.duration
                holder.tvTotalDuration.text = formatTime(duration)
                holder.seekBar.max = duration
                holder.seekBar.progress = mediaPlayer!!.currentPosition
                holder.tvCurrentTime.text = formatTime(mediaPlayer!!.currentPosition)
                
                handler.removeCallbacks(updateSeekBar ?: Runnable {})
                updateSeekBar = object : Runnable {
                    override fun run() {
                        mediaPlayer?.let {
                            if (it.isPlaying) {
                                holder.seekBar.progress = it.currentPosition
                                holder.tvCurrentTime.text = formatTime(it.currentPosition)
                                handler.postDelayed(this, 100)
                            }
                        }
                    }
                }
                handler.post(updateSeekBar!!)
                
                holder.seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) {
                        if (fromUser) mediaPlayer?.seekTo(p)
                    }
                    override fun onStartTrackingTouch(s: SeekBar?) {}
                    override fun onStopTrackingTouch(s: SeekBar?) {}
                })
            } else {
                holder.seekBar.progress = 0
                holder.tvCurrentTime.text = "00:00"
            }

            holder.btnPlay.setOnClickListener { togglePlay(file, holder.adapterPosition) }
            holder.btnDelete.setOnClickListener { deleteFile(file, holder.adapterPosition) }
        }

        override fun getItemCount() = files.size
    }

    override fun onDestroy() {
        super.onDestroy()
        stopPlayback()
    }
}
