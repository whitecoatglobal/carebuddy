"""Create an original gentle instrumental bed; no voice inputs are used."""
from pathlib import Path
import json
import math
import wave
import numpy as np

submission = Path(__file__).resolve().parents[1]
root = submission / '.build'
root.mkdir(exist_ok=True)
duration = json.loads((submission / 'inputs' / 'caption-timeline.json').read_text())['duration']
rate = 32000
total = math.ceil(duration * rate)
mix = np.zeros((total, 2), dtype=np.float32)
rng = np.random.default_rng(260109)
beat = 60 / 68
bar = beat * 4
chords = [
    (48, [60, 64, 67, 71, 74]),  # C major ninth
    (45, [57, 60, 64, 67, 71]),  # A minor ninth
    (41, [57, 60, 64, 67, 72]),  # F major ninth
    (43, [55, 62, 65, 69, 74]),  # G suspended
    (40, [55, 59, 62, 67, 71]),  # E minor seventh
    (45, [57, 60, 64, 67, 71]),
    (50, [57, 60, 64, 65, 69]),  # D minor ninth
    (43, [55, 59, 62, 64, 69]),  # G sixth
]
melodies = [
    [76, 74, 71, 67], [72, 71, 69, 64], [69, 72, 76, 74], [74, 69, 67, 62],
    [71, 74, 67, 64], [69, 67, 64, 60], [69, 72, 74, 69], [67, 69, 71, 74],
]

def add_note(start, midi, amplitude, pan, length=4.2):
    offset = max(0, round(start * rate))
    count = min(round(length * rate), total - offset)
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / rate
    frequency = 440 * 2 ** ((midi - 69) / 12)
    attack = 1 - np.exp(-t / .010)
    end = np.clip((length - t) / .24, 0, 1)
    sound = np.zeros(count, dtype=np.float32)
    for harmonic, level, decay in [(1, 1, 2.6), (2.002, .27, 1.7), (3.007, .10, 1.1), (4.014, .035, .7)]:
        sound += level * np.cos(2 * np.pi * frequency * harmonic * t) * np.exp(-t / decay)
    sound *= attack * end * amplitude
    left, right = math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)
    mix[offset:offset + count, 0] += sound * left
    mix[offset:offset + count, 1] += sound * right

def add_pad(start, notes):
    length = bar + 1.1
    offset = max(0, round(start * rate))
    count = min(round(length * rate), total - offset)
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / rate
    envelope = np.minimum(1, t / 1.0) * np.clip((length - t) / 1.5, 0, 1)
    for i, midi in enumerate(notes[:3]):
        frequency = 440 * 2 ** ((midi - 69) / 12)
        left = np.sin(2 * np.pi * frequency * .9994 * t)
        right = np.sin(2 * np.pi * frequency * 1.0006 * t)
        slow = .88 + .12 * np.sin(2 * np.pi * .08 * t + i)
        mix[offset:offset + count, 0] += left * envelope * slow * .012
        mix[offset:offset + count, 1] += right * envelope * slow * .012

for index in range(math.ceil(duration / bar)):
    start = index * bar
    root_note, chord = chords[index % len(chords)]
    add_note(start, root_note, .11, -.06, 4.5)
    add_pad(start, chord)
    order = [0, 2, 1, 3] if index % 2 == 0 else [0, 1, 2, 4]
    for step, note_index in enumerate(order):
        moment = start + (step * .85 + .12) * beat + float(rng.uniform(-.016, .016))
        add_note(moment, chord[note_index], float(rng.uniform(.060, .078)), -.25 + step / 6, 3.6)
    # A sparse four-note phrase appears in alternate bars.
    if index % 2 == 0:
        for step, midi in enumerate(melodies[(index // 2) % len(melodies)]):
            add_note(start + (.55 + step * .82) * beat, midi, .062, .22, 3.4)

# Quiet cross-channel reflections soften the keys without percussion.
dry = mix.copy()
for delay, gain in [(.139, .11), (.281, .085), (.419, .06), (.613, .035)]:
    shift = round(delay * rate)
    mix[shift:] += dry[:-shift, ::-1] * gain
del dry
fade_in = round(5 * rate)
fade_out = round(9 * rate)
mix[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
mix[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)[:, None]
rms = float(np.sqrt(np.mean(mix ** 2)))
mix *= (10 ** (-24 / 20)) / rms
peak = float(np.max(np.abs(mix)))
if peak > .42:
    mix *= .42 / peak
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
with wave.open(str(root / 'soft-background.wav'), 'wb') as audio:
    audio.setnchannels(2)
    audio.setsampwidth(2)
    audio.setframerate(rate)
    audio.writeframes(pcm.tobytes())
print(json.dumps({'file': 'soft-background.wav', 'durationSeconds': total / rate, 'meanVolumeDb': 20 * math.log10(float(np.sqrt(np.mean(mix ** 2)))), 'peakDb': 20 * math.log10(float(np.max(np.abs(mix)))), 'content': 'Original gentle instrumental keys and ambient pad; no speech'}))
