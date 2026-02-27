package com.example.respirascan

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

class WaveformView(context: Context, attrs: AttributeSet?) : View(context, attrs) {

    private val paint = Paint().apply {
        color = Color.parseColor("#E91E63")
        strokeWidth = 8f // Slightly thicker for better visibility
        isAntiAlias = true
        strokeCap = Paint.Cap.ROUND
    }

    private val amplitudes = mutableListOf<Float>()
    private val maxAmplitudes = 100

    fun addAmplitude(amplitude: Float) {
        // Normalize amplitude to a visible range
        // maxAmplitude usually goes up to 32767
        val normalized = if (amplitude > 0) amplitude else 100f
        amplitudes.add(normalized)
        if (amplitudes.size > maxAmplitudes) {
            amplitudes.removeAt(0)
        }
        postInvalidateOnAnimation() // Smoother UI updates
    }

    fun clear() {
        amplitudes.clear()
        postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (amplitudes.isEmpty()) return

        val centerY = height / 2f
        val spacing = width.toFloat() / maxAmplitudes
        
        // Draw bars from right to left for a scrolling effect
        val startX = width - (amplitudes.size * spacing)

        for (i in amplitudes.indices) {
            val x = startX + (i * spacing)
            val amplitude = amplitudes[i]
            // Scale amplitude to height, ensuring at least a small line is visible
            var lineHeight = (amplitude / 32768f) * (height * 0.8f)
            if (lineHeight < 10f) lineHeight = 10f 

            canvas.drawLine(x, centerY - lineHeight / 2, x, centerY + lineHeight / 2, paint)
        }
    }
}
