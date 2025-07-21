# Transcribe Speech

A Node.js application that transcribes audio files to text using OpenAI's Whisper API. This tool automatically handles large audio files by splitting them into manageable chunks at natural silence points, ensuring high-quality transcription results.

## Features

- **Automatic Audio Processing**: Converts various audio formats to MP3 for OpenAI compatibility
- **Smart Chunking**: Automatically splits long audio files (>60 seconds) at natural silence points
- **Silence Detection**: Uses FFmpeg to detect optimal split points based on audio silence
- **Batch Processing**: Processes audio chunks sequentially and combines results
- **Flexible Output**: Saves transcriptions to text files with timestamps
- **Audio Analysis**: Provides detailed audio file information and characteristics

## Prerequisites

- Node.js (v14 or higher)
- OpenAI API key
- FFmpeg (automatically installed via npm package)

## Installation

### Option 1: Using npx (Recommended)

Run directly without installation:
```bash
npx transcribe-speech path/to/audio.mp3
```

### Option 2: Global Installation

Install globally for repeated use:
```bash
npm install -g transcribe-speech
```

Then use it as:
```bash
transcribe-speech path/to/audio.mp3
```

### Option 3: Local Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set your OpenAI API key as an environment variable:
   ```bash
   export OPENAI_API_KEY="your_openai_api_key_here"
   ```

## Usage

### Basic Usage

```bash
npx transcribe-speech path/to/audio.mp3
# or if installed globally:
transcribe-speech path/to/audio.mp3
```

### Specify Output File

```bash
npx transcribe-speech path/to/audio.mp3 output.txt
# or if installed globally:
transcribe-speech path/to/audio.mp3 output.txt
```

### Test Silence Detection

```bash
npx transcribe-speech path/to/audio.mp3 output.txt test
# or if installed globally:
transcribe-speech path/to/audio.mp3 output.txt test
```

## Supported Audio Formats

The app can handle various audio formats including:
- MP3, WAV, M4A, FLAC, OGG, and more
- Automatically converts to MP3 for OpenAI API compatibility

## Output Format

For short audio files (<60 seconds):
```
[Transcription text]
```

For long audio files (split into chunks):
```
[00:00 - 01:30]
First chunk transcription text

[01:30 - 03:15]
Second chunk transcription text

[03:15 - end]
Final chunk transcription text
```
