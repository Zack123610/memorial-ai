Sample inputs for the Create form (/create).

  portrait.jpg           Front-facing photo of an older man
  my-sample-voice.wav    ~10.6s spoken reference (mono 24 kHz WAV)
  voice-transcript.txt   Paste this as the voice-sample transcript
  farewell.txt           28-word farewell / last wish

Keep the farewell short. The cloned speech drives the video and Wan i2v caps a
clip at 15s, so the Create form rejects anything longer than VIDEO_DURATION_MAX
(15s ≈ 162 characters of English, 54 of Chinese). This sample is 146
characters, which clones to ~12.3s of speech and a 13s video.
