package com.example.respirascan

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private companion object {
        const val REQUEST_RECORD_AUDIO_PERMISSION = 200
    }

    private var mediaRecorder: MediaRecorder? = null
    private var isRecording = false
    private var audioFilePath: String = ""

    private lateinit var btnMic: ImageButton
    private lateinit var btnViewRecordings: Button
    private lateinit var tvResult: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var waveformView: WaveformView

    private val handler = Handler(Looper.getMainLooper())
    private val updateVisualizerRunnable = object : Runnable {
        override fun run() {
            if (isRecording) {
                val amplitude = mediaRecorder?.maxAmplitude ?: 0
                waveformView.addAmplitude(amplitude.toFloat())
                handler.postDelayed(this, 100)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        btnMic = findViewById(R.id.btnMic)
        btnViewRecordings = findViewById(R.id.btnViewRecordings)
        tvResult = findViewById(R.id.tvResult)
        progressBar = findViewById(R.id.progressBar)
        waveformView = findViewById(R.id.waveformView)

        btnMic.setOnClickListener {
            if (isRecording) {
                stopRecording()
            } else {
                if (checkPermissions()) {
                    startRecording()
                } else {
                    requestPermissions()
                }
            }
        }

        btnViewRecordings.setOnClickListener {
            val intent = Intent(this, RecordingsActivity::class.java)
            startActivity(intent)
        }
    }

    private fun checkPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestPermissions() {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_RECORD_AUDIO_PERMISSION)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_RECORD_AUDIO_PERMISSION) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startRecording()
            } else {
                Toast.makeText(this, "Permission Denied", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startRecording() {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val recordingsDir = externalCacheDir ?: filesDir
        // Changed extension to .mp4 for better compatibility and quality
        audioFilePath = "${recordingsDir.absolutePath}/cough_$timeStamp.mp4"

        val recorder: MediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(this)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        mediaRecorder = recorder.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setOutputFile(audioFilePath)

            try {
                prepare()
                start()
                isRecording = true
                updateUI(true)
                waveformView.clear()
                handler.post(updateVisualizerRunnable)
            } catch (e: IOException) {
                e.printStackTrace()
                Toast.makeText(this@MainActivity, "Recording failed", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun stopRecording() {
        handler.removeCallbacks(updateVisualizerRunnable)
        mediaRecorder?.apply {
            try {
                stop()
                release()
            } catch (e: Exception) {
                // stop() can throw exception if no data was received
                e.printStackTrace()
            }
        }
        mediaRecorder = null
        isRecording = false
        updateUI(false)
        tvResult.text = "Recording saved: ${File(audioFilePath).name}"
    }

    private fun updateUI(recording: Boolean) {
        if (recording) {
            btnMic.setImageResource(android.R.drawable.ic_media_pause)
            progressBar.visibility = View.VISIBLE
            tvResult.text = "Recording Cough..."
            btnViewRecordings.visibility = View.GONE
        } else {
            btnMic.setImageResource(android.R.drawable.ic_btn_speak_now)
            progressBar.visibility = View.GONE
            btnViewRecordings.visibility = View.VISIBLE
        }
    }

    override fun onStop() {
        super.onStop()
        if (isRecording) {
            stopRecording()
        }
    }
}