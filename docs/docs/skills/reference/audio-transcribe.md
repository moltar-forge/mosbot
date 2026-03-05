---
id: audio-transcribe
title: audio_transcribe
sidebar_label: audio_transcribe
sidebar_position: 3
---

:::warning Work in Progress This skill is currently under development and may change significantly.
:::

**Type**: Shared Skill  
**Scope**: All agents  
**Location**: `/skills/audio_transcribe/SKILL.md`

---

## Copy This Skill

<pre id="skill-content-audio-transcribe" style={{display: 'none'}}>{`---
name: audio_transcribe
description: Transcribe audio files into text for processing
---

# Audio Transcribe

Transcribes audio files (voice messages, recordings) into text for processing by the agent.

## Usage

Invoke with: /audio_transcribe [audio_url_or_attachment]

## Examples

- /audio_transcribe https://example.com/meeting-recording.mp3
- /audio_transcribe [attached voice message]

## Supported Formats

- MP3
- WAV
- OGG
- M4A
- WebM

## Output

The agent will return:

## Transcription

[Full transcribed text of the audio]

---

Duration: 3:42
Confidence: 94%

## Options

Additional processing flags:
- --summarize - Provide a summary of the transcription
- --extract-action-items - Extract action items from the audio
- --speaker-identification - Identify different speakers

## Notes

- Maximum file size: 50MB
- For longer recordings, the transcription may take several minutes
- Quality depends on audio clarity and background noise
- Speaker identification works best with distinct voices
`}</pre>

<div style={{position: 'relative'}}>
  <button
    id="copy-btn-audio-transcribe"
    onClick={() => {
      const content = document.getElementById('skill-content-audio-transcribe').textContent;
      navigator.clipboard.writeText(content);
      const btn = document.getElementById('copy-btn-audio-transcribe');
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📋'; }, 2000);
    }}
    style={{
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: 10,
      background: 'var(--ifm-color-primary)',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      padding: '2px 8px',
      fontSize: '16px',
      cursor: 'pointer',
      lineHeight: '1.6',
      title: 'Copy SKILL.md',
    }}
  >📋</button>

  <details>
  <summary style={{cursor: 'pointer', userSelect: 'none', paddingRight: '140px'}}>📋 Click to view SKILL.md content</summary>

  <div style={{marginTop: '1rem'}}>
    <pre style={{margin: 0, padding: '1rem', background: 'var(--ifm-code-background)'}}><code style={{whiteSpace: 'pre-wrap'}}>{`---
name: audio_transcribe
description: Transcribe audio files into text for processing
---

# Audio Transcribe

Transcribes audio files (voice messages, recordings) into text for processing by the agent.

## Usage

Invoke with: /audio_transcribe [audio_url_or_attachment]

## Examples

- /audio_transcribe <https://example.com/meeting-recording.mp3>
- /audio_transcribe [attached voice message]

## Supported Formats

- MP3
- WAV
- OGG
- M4A
- WebM

## Output

The agent will return:

## Transcription

[Full transcribed text of the audio]

---

Duration: 3:42 Confidence: 94%

## Options

Additional processing flags:

- --summarize - Provide a summary of the transcription
- --extract-action-items - Extract action items from the audio
- --speaker-identification - Identify different speakers

## Notes

- Maximum file size: 50MB
- For longer recordings, the transcription may take several minutes
- Quality depends on audio clarity and background noise
- Speaker identification works best with distinct voices `}</code></pre>
    </div>

    </details>
  </div>

---

## Description

Transcribes audio files (voice messages, recordings) into text for processing by the agent.

## Usage

```
/audio_transcribe [audio_url_or_attachment]
```

## Examples

```
/audio_transcribe https://example.com/meeting-recording.mp3
/audio_transcribe [attached voice message]
```

## Supported Formats

- MP3
- WAV
- OGG
- M4A
- WebM

## Output

The agent will return:

```markdown
## Transcription

[Full transcribed text of the audio]

---

**Duration**: 3:42  
**Confidence**: 94%
```

## Options

You can request additional processing:

```
/audio_transcribe [audio] --summarize
/audio_transcribe [audio] --extract-action-items
/audio_transcribe [audio] --speaker-identification
```

## Notes

- Maximum file size: 50MB
- For longer recordings, the transcription may take several minutes
- Quality depends on audio clarity and background noise
- Speaker identification works best with distinct voices
