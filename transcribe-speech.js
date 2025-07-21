#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Default/fallback API key (replace with your own, optional)
const DEFAULT_OPENAI_API_KEY = 'MY_OPEN_AI_API_KEY';

// Prefer environment variable, fallback to default
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || DEFAULT_OPENAI_API_KEY;

// Get file path from command line arguments
const [,, inputFile, outputFile, testMode] = process.argv;

if (!inputFile) {
  console.error('Usage: node transcribe-speech.js path/to/audio.mp3 [output.txt] [test]');
  console.error('  test: Add "test" as third argument to run silence detection tests');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('Error: OpenAI API key not set. Set the OPENAI_API_KEY environment variable or provide a default in the script.');
  process.exit(1);
}

// Function to format timestamp
function formatTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

// Function to save transcription to file
function saveTranscriptionToFile(transcription, inputPath, customOutputPath = null) {
  let outputPath;
  
  if (customOutputPath) {
    outputPath = customOutputPath;
  } else {
    // Generate default output filename based on input
    const inputDir = path.dirname(inputPath);
    const inputBaseName = path.basename(inputPath, path.extname(inputPath));
    outputPath = path.join(inputDir, `${inputBaseName}_transcription.txt`);
  }
  
  try {
    fs.writeFileSync(outputPath, transcription, 'utf8');
    console.log(`\nTranscription saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(`Error saving transcription to file: ${error.message}`);
    return null;
  }
}

// Function to append transcription to file
function appendTranscriptionToFile(transcription, inputPath, customOutputPath = null) {
  let outputPath;
  
  if (customOutputPath) {
    outputPath = customOutputPath;
  } else {
    // Generate default output filename based on input
    const inputDir = path.dirname(inputPath);
    const inputBaseName = path.basename(inputPath, path.extname(inputPath));
    outputPath = path.join(inputDir, `${inputBaseName}_transcription.txt`);
  }
  
  try {
    fs.appendFileSync(outputPath, transcription + '\n\n', 'utf8');
    return outputPath;
  } catch (error) {
    console.error(`Error appending transcription to file: ${error.message}`);
    return null;
  }
}

// Function to get audio duration in seconds
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration);
      }
    });
  });
}

// Function to split audio into chunks at silence points
function splitAudioIntoChunks(inputPath, chunkDuration = 30) {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(path.dirname(inputPath), 'chunks');
    const baseName = path.basename(inputPath, path.extname(inputPath));
    
    // Create chunks directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const chunks = [];

    // Use FFmpeg to detect silence and split at those points
    // -af silencedetect: noise threshold, duration threshold
    // -f segment with segment_times based on silence detection
    ffmpeg(inputPath)
      .outputOptions([
        '-af', 'silencedetect=noise=-16dB:d=0.25', // Detect silence below -50dB for 0.5 seconds
        '-f', 'null'
      ])
      .output('-')
      .on('stderr', (stderrLine) => {
        // Parse silence detection output
        const silenceMatch = stderrLine.match(/silence_start: (\d+\.?\d*)/);
        if (silenceMatch) {
          chunks.push(parseFloat(silenceMatch[1]));
          // console.log(`Silence detected at: ${parseFloat(silenceMatch[1]).toFixed(2)}s`);
        }
      })
      .on('end', () => {
        // Now split the audio using silence detection
        splitAtSilence(inputPath, outputDir, baseName, chunkDuration)
          .then(resolve)
          .catch(reject);
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
}

// Function to split audio at silence points with duration limits
function splitAtSilence(inputPath, outputDir, baseName, maxChunkDuration = 60) {
  return new Promise((resolve, reject) => {
    const silencePoints = [];
    let audioDuration = 0;

    console.log(`\nAnalyzing audio file for silence points...`);
    console.log(`Target chunk duration: ${maxChunkDuration} seconds`);

    // First pass: detect silence points and get duration
    ffmpeg(inputPath)
      .outputOptions([
        '-af', 'silencedetect=noise=-16dB:d=0.25',
        '-f', 'null'
      ])
      .output('-')
      .on('stderr', (stderrLine) => {
        // Parse duration
        const durationMatch = stderrLine.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          audioDuration = hours * 3600 + minutes * 60 + seconds;
          console.log(`Audio duration: ${formatTimestamp(audioDuration)} (${audioDuration.toFixed(1)} seconds)`);
        }

        // Parse silence start points
        const silenceMatch = stderrLine.match(/silence_start: (\d+\.?\d*)/);
        if (silenceMatch) {
          const silencePoint = parseFloat(silenceMatch[1]);
          silencePoints.push(silencePoint);
          // console.log(`Silence detected at: ${formatTimestamp(silencePoint)} (${silencePoint.toFixed(1)}s)`);
        }
      })
      .on('end', () => {
        console.log(`\nTotal silence points found: ${silencePoints.length}`);
        
        if (silencePoints.length === 0) {
          console.log('No silence points detected. This might indicate:');
          console.log('- Audio is very quiet throughout');
          console.log('- Silence detection threshold is too high');
          console.log('- Audio format issues');
        }
        
        // Calculate optimal split points
        const splitPoints = calculateOptimalSplitPoints(silencePoints, audioDuration, maxChunkDuration);
        
        console.log(`Optimal split points calculated: ${splitPoints.length}`);
        // splitPoints.forEach((point, index) => {
        //   console.log(`  Split ${index + 1}: ${formatTimestamp(point)} (${point.toFixed(1)}s)`);
        // });
        
        if (splitPoints.length === 0) {
          // No good silence points found, fall back to time-based splitting
          console.log('\nNo suitable silence points found, using time-based splitting...');
          splitByTime(inputPath, outputDir, baseName, maxChunkDuration)
            .then(resolve)
            .catch(reject);
        } else {
          // Split at calculated silence points
          console.log(`\nSplitting at ${splitPoints.length} silence points...`);
          splitAtSpecificPoints(inputPath, outputDir, baseName, splitPoints)
            .then(resolve)
            .catch(reject);
        }
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
}

// Calculate optimal split points based on silence and duration constraints
function calculateOptimalSplitPoints(silencePoints, totalDuration, maxChunkDuration) {
  const splitPoints = [];
  let currentTime = 0;

  for (let i = 0; i < silencePoints.length; i++) {
    const silencePoint = silencePoints[i];
    
    // Check if this silence point is within reasonable range
    if (silencePoint - currentTime >= maxChunkDuration * 0.8) { // Allow some flexibility
      // Find the best silence point within the target duration
      let bestPoint = silencePoint;
      
      // Look for silence points around the target duration
      for (let j = i; j < silencePoints.length; j++) {
        const candidatePoint = silencePoints[j];
        const chunkDuration = candidatePoint - currentTime;
        
        if (chunkDuration <= maxChunkDuration && chunkDuration >= maxChunkDuration * 0.5) {
          bestPoint = candidatePoint;
          break;
        } else if (chunkDuration > maxChunkDuration) {
          break;
        }
      }
      
      splitPoints.push(bestPoint);
      currentTime = bestPoint;
    }
  }

  return splitPoints;
}

// Split audio at specific time points
function splitAtSpecificPoints(inputPath, outputDir, baseName, splitPoints) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let chunkIndex = 0;

    // Create segments array
    const segments = [];
    
    for (let i = 0; i < splitPoints.length; i++) {
      const startTime = i === 0 ? 0 : splitPoints[i - 1];
      const endTime = splitPoints[i];
      segments.push({ start: startTime, end: endTime });
    }
    
    // Add final segment if needed
    if (splitPoints.length > 0) {
      segments.push({ start: splitPoints[splitPoints.length - 1], end: null });
    }

    // Process each segment individually
    let processedCount = 0;
    
    segments.forEach((segment, index) => {
      const outputPath = path.join(outputDir, `${baseName}_chunk_${String(index).padStart(3, '0')}.mp3`);
      
      let command = ffmpeg(inputPath)
        .outputOptions([
          '-ss', segment.start.toString(),
          '-c:a', 'mp3',
          '-b:a', '128k',
          '-ar', '16000',
          '-ac', '1'
        ]);
      
      if (segment.end !== null) {
        command = command.outputOptions(['-t', (segment.end - segment.start).toString()]);
      }
      
      command
        .output(outputPath)
        .on('end', () => {
          chunks.push({
            path: outputPath,
            startTime: segment.start,
            endTime: segment.end
          });
          processedCount++;
          
          if (processedCount === segments.length) {
            resolve(chunks);
          }
        })
        .on('error', (err) => {
          reject(new Error(`Error creating chunk ${index}: ${err.message}`));
        })
        .run();
    });
  });
}

// Fallback function for time-based splitting
function splitByTime(inputPath, outputDir, baseName, chunkDuration) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    ffmpeg(inputPath)
      .outputOptions([
        '-f', 'segment',
        '-segment_time', chunkDuration.toString(),
        '-c:a', 'mp3',
        '-b:a', '128k',
        '-ar', '16000',
        '-ac', '1',
        '-reset_timestamps', '1',
        '-avoid_negative_ts', 'make_zero'
      ])
      .output(path.join(outputDir, `${baseName}_chunk_%03d.mp3`))
      .on('end', () => {
        // Get list of generated chunks
        const files = fs.readdirSync(outputDir)
          .filter(file => file.startsWith(`${baseName}_chunk_`) && file.endsWith('.mp3'))
          .sort();
        
        files.forEach((file, index) => {
          const startTime = index * chunkDuration;
          chunks.push({
            path: path.join(outputDir, file),
            startTime: startTime,
            endTime: startTime + chunkDuration
          });
        });
        
        resolve(chunks);
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
}

// Function to test different silence detection parameters
function testSilenceDetection(inputPath) {
  return new Promise((resolve, reject) => {
    console.log('\n=== TESTING SILENCE DETECTION PARAMETERS ===');
    
    const testParams = [
      { noise: -20, duration: 0.1, desc: 'Very sensitive (short silences)' },
      { noise: -16, duration: 0.25, desc: 'Current setting' },
      { noise: -12, duration: 0.5, desc: 'Less sensitive (longer silences)' },
      { noise: -8, duration: 1.0, desc: 'Very insensitive (very long silences)' }
    ];
    
    let completedTests = 0;
    const results = [];
    
    testParams.forEach((params, index) => {
      const silencePoints = [];
      
      ffmpeg(inputPath)
        .outputOptions([
          `-af`, `silencedetect=noise=${params.noise}dB:d=${params.duration}`,
          '-f', 'null'
        ])
        .output('-')
        .on('stderr', (stderrLine) => {
          const silenceMatch = stderrLine.match(/silence_start: (\d+\.?\d*)/);
          if (silenceMatch) {
            silencePoints.push(parseFloat(silenceMatch[1]));
          }
        })
        .on('end', () => {
          results.push({
            params: params,
            silenceCount: silencePoints.length,
            silencePoints: silencePoints
          });
          
          console.log(`Test ${index + 1}: ${params.desc}`);
          console.log(`  Noise: ${params.noise}dB, Duration: ${params.duration}s`);
          console.log(`  Silence points found: ${silencePoints.length}`);
          
          completedTests++;
          if (completedTests === testParams.length) {
            console.log('\n=== SILENCE DETECTION TEST RESULTS ===');
            results.forEach((result, i) => {
              console.log(`${i + 1}. ${result.params.desc}: ${result.silenceCount} silence points`);
            });
            resolve(results);
          }
        })
        .on('error', (err) => {
          console.error(`Error in test ${index + 1}: ${err.message}`);
          completedTests++;
          if (completedTests === testParams.length) {
            resolve(results);
          }
        })
        .run();
    });
  });
}

// Function to analyze audio characteristics
function analyzeAudioCharacteristics(filePath) {
  return new Promise((resolve, reject) => {
    console.log(`\nAnalyzing audio characteristics for: ${path.basename(filePath)}`);
    
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Error analyzing audio: ${err.message}`));
        return;
      }
      
      const format = metadata.format;
      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
      
      console.log(`Format: ${format.format_name}`);
      console.log(`Duration: ${formatTimestamp(format.duration)}`);
      console.log(`Bit rate: ${(format.bit_rate / 1000).toFixed(0)} kbps`);
      console.log(`File size: ${(format.size / 1024 / 1024).toFixed(2)} MB`);
      
      if (audioStream) {
        console.log(`Codec: ${audioStream.codec_name}`);
        console.log(`Sample rate: ${audioStream.sample_rate} Hz`);
        console.log(`Channels: ${audioStream.channels}`);
        console.log(`Bits per sample: ${audioStream.bits_per_sample || 'unknown'}`);
      }
      
      resolve(metadata);
    });
  });
}

// Function to validate audio file format
function validateAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Invalid audio file: ${err.message}`));
        return;
      }
      
      console.log(`Audio format: ${metadata.format.format_name}`);
      console.log(`Duration: ${metadata.format.duration} seconds`);
      console.log(`Bit rate: ${metadata.format.bit_rate} bps`);
      
      if (metadata.streams && metadata.streams.length > 0) {
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        if (audioStream) {
          console.log(`Audio codec: ${audioStream.codec_name}`);
          console.log(`Sample rate: ${audioStream.sample_rate} Hz`);
          console.log(`Channels: ${audioStream.channels}`);
        }
      }
      
      resolve(metadata);
    });
  });
}

// Function to convert audio to MP3 format for OpenAI compatibility
function convertToMP3(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace(/\.[^/.]+$/, '.mp3');
    
    // If already MP3, return the original path
    if (path.extname(inputPath).toLowerCase() === '.mp3') {
      resolve(inputPath);
      return;
    }
    
    console.log(`Converting ${path.basename(inputPath)} to MP3...`);
    
    ffmpeg(inputPath)
      .outputOptions([
        '-c:a', 'mp3',
        '-b:a', '128k',
        '-ar', '16000',
        '-ac', '1'
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`✓ Converted to MP3: ${path.basename(outputPath)}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(new Error(`Conversion error: ${err.message}`));
      })
      .run();
  });
}

// Function to transcribe a single audio file
async function transcribeAudioFile(filePath) {
  try {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }

    // Get file info for debugging
    const stats = fs.statSync(absPath);
    console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Check if file is too large (OpenAI has a 25MB limit)
    if (stats.size > 25 * 1024 * 1024) {
      throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)} MB (max 25MB)`);
    }

    // Validate the original audio file
    console.log('Validating audio file...');
    await validateAudioFile(absPath);
    
    // Convert to MP3 if needed for OpenAI compatibility
    const compatiblePath = await convertToMP3(absPath);
    
    // Validate the converted file
    console.log('Validating converted file...');
    await validateAudioFile(compatiblePath);
    
    // Get converted file info
    const convertedStats = fs.statSync(compatiblePath);
    console.log(`Converted file size: ${(convertedStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(compatiblePath));
    formData.append('model', 'whisper-1');

    console.log(`Sending file to OpenAI API: ${path.basename(compatiblePath)}`);

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    // Clean up converted file if it's different from original
    if (compatiblePath !== absPath && fs.existsSync(compatiblePath)) {
      fs.unlinkSync(compatiblePath);
    }

    return response.data.text;
  } catch (error) {
    console.error('Full error details:', error.response ? error.response.data : error);
    throw new Error(`Transcription error: ${error.response ? error.response.data.error.message : error.message}`);
  }
}

// Main transcription function
async function transcribeAudio(filePath) {
  try {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      console.error(`File not found: ${absPath}`);
      process.exit(1);
    }

    console.log('Getting audio duration...');
    const duration = await getAudioDuration(absPath);
    console.log(`Audio duration: ${Math.round(duration)} seconds (${Math.round(duration / 60)} minutes)`);
    
    // Analyze audio characteristics for debugging
    await analyzeAudioCharacteristics(absPath);

    // Run silence detection tests if requested
    if (testMode === 'test') {
      await testSilenceDetection(absPath);
      console.log('\nTest mode completed. Run without "test" argument to perform actual transcription.');
      process.exit(0);
    }

    // If audio is longer than 60 seconds, split into chunks
    if (duration > 60) {
      console.log('Audio is longer than 1 minute. Splitting into chunks...');
      const chunks = await splitAudioIntoChunks(absPath);
      console.log(`Created ${chunks.length} chunks`);

      // Initialize output file
      const outputPath = outputFile || path.join(path.dirname(absPath), `${path.basename(absPath, path.extname(absPath))}_transcription.txt`);
      
      // Clear the file if it exists
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      
      console.log(`\nTranscription will be saved to: ${outputPath}\n`);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const startTime = formatTimestamp(chunk.startTime);
        const endTime = chunk.endTime ? formatTimestamp(chunk.endTime) : 'end';
        
        console.log('--------------------------------');
        console.log(`Transcribing chunk ${i + 1}/${chunks.length} (${startTime} - ${endTime})...`);
        try {
          const transcription = await transcribeAudioFile(chunk.path);
          const chunkText = `[${startTime} - ${endTime}]\n${transcription}`;
          
          // Write this chunk to file immediately
          appendTranscriptionToFile(chunkText, absPath, outputFile);
          
          console.log(`✓ Chunk ${i + 1} completed and saved`);
        } catch (error) {
          console.error(`✗ Error transcribing chunk ${i + 1}:`, error.message);
          const errorText = `[${startTime} - ${endTime}]\n[ERROR: ${error.message}]`;
          appendTranscriptionToFile(errorText, absPath, outputFile);
        }
      }

      console.log('\n=== TRANSCRIPTION COMPLETE ===');
      console.log(`All chunks processed and saved to: ${outputPath}`);

      // Clean up chunks
      console.log('\nCleaning up temporary files...');
      const outputDir = path.join(path.dirname(absPath), 'chunks');
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }

    } else {
      // Audio is short enough to transcribe directly
      console.log('Transcribing audio file directly...');
      const transcription = await transcribeAudioFile(absPath);
      console.log('Transcription:', transcription);
      
      // Save transcription to file
      saveTranscriptionToFile(transcription, absPath, outputFile);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

transcribeAudio(inputFile);
