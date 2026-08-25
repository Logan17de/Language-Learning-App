# AIKO TTS Colab benchmark kit

This folder isolates speech-model experiments from the AIKO application.

## Notebooks

| Notebook | Model | What it tests |
|---|---|---|
| `qwen3_tts_colab.ipynb` | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | Japanese TTS, Ono_Anna voice, style instructions, latency/RTF, GPU memory, concurrency, **true PCM streaming**, Gradio live UI |
| `indextts25_colab.ipynb` | `IndexTeam/IndexTTS-2.5` | Japanese zero-shot cloning, speed, emotion, latency/RTF, GPU memory, concurrency, interactive Gradio UI |

### Open directly in Colab

- [Qwen3-TTS notebook](https://colab.research.google.com/github/Logan17de/Language-Learning-App/blob/experiment/qwen-index-tts-colab/experiments/tts-colab/qwen3_tts_colab.ipynb)
- [IndexTTS-2.5 notebook](https://colab.research.google.com/github/Logan17de/Language-Learning-App/blob/experiment/qwen-index-tts-colab/experiments/tts-colab/indextts25_colab.ipynb)

## Recommended test order

1. Use one fresh Colab runtime per notebook.
2. Select an NVIDIA GPU runtime. A100 80 GB is ideal for stress/concurrency tests.
3. Run the one-line Japanese synthesis test.
4. Listen to all four AIKO prompts in `test_prompts.json`.
5. Compare `latency_s`, `audio_s`, and `rtf`.
6. For Qwen, record `first_audible_chunk_s` from the streaming test.
7. Run concurrency 1, 2, and 4 first. Increase only after confirming VRAM headroom.
8. Run the Gradio UI and judge naturalness manually.

## Metrics

- **latency_s** — wall-clock request time.
- **audio_s** — generated audio duration.
- **RTF** — `generation time / audio duration`; lower is better. `< 1.0` means faster than realtime.
- **first_chunk_s** — Qwen only; time until the first streamed PCM bytes arrive.
- **first_audible_chunk_s** — Qwen only; time until a chunk contains non-trivial audio amplitude.
- **requests_per_s** — aggregate throughput in the small concurrency benchmark.
- **gpu_used_mib** — current GPU memory after the request (not a sampled peak).

## Important model differences

Qwen3-TTS currently has true PCM/WebSocket streaming in vLLM-Omni and is the primary realtime candidate.

IndexTTS-2.5 supports production serving through `/v1/audio/speech`, Japanese, native speed control, voice cloning, and emotion control, but its current serving path should be treated as non-chunked for playback. The Gradio notebook is interactive, not true streamed speech.

## Voice-cloning safety

IndexTTS-2.5 requires a speaker reference. Use only your own recording or audio for which you have permission to clone the speaker. Do not commit reference recordings or generated private voice samples to this repository.

## Licensing

- Qwen3-TTS model: Apache-2.0.
- IndexTTS-2.5 model: Bilibili Model Use License. Review the current license before commercial deployment.

## Production note

These notebooks are benchmarks, not the final AIKO production server. Once the winner/configuration is selected, move the same vLLM-Omni serving contract into a Dockerized GPU service and benchmark on the intended production GPU.
