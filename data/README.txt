Sample inputs for the Create form (/create).

  portrait.jpg           Front-facing photo of an older man
  my-sample-voice.wav    ~10.6s spoken reference (mono 24 kHz WAV)
  voice-transcript.txt   Paste this as the voice-sample transcript
  farewell.txt           28-word farewell / last wish

Keep the farewell short. The cloned speech drives the video, and Wan i2v
accepts at most 30s of audio while the pipeline caps the video at
VIDEO_DURATION_MAX (10s by default), so a longer message is cut off.
Roughly 30 words fits a 10s video.
