# X5 View Remote

A tiny local remote that turns an Insta360 X5's stitched 360° webcam feed into a steerable camera view in OBS. Drag the trackball, adjust zoom, or glide between three named shots. The controls sit on the faces of a cube you turn with chevrons, and the remote can float above your other windows.

<p align="center">
  <img src="docs/controller.jpg" width="320" alt="X5 View Remote with a draggable trackball, arrow controls, zoom and horizon knobs, saved spots, and glide speed and easing controls">
</p>

No npm dependencies, cloud services, or API keys. A **Follow** button keeps you in frame, and a two-hand push or pull zooms out or in. This repo contains the frontend, local OBS bridge, shader, setup utility, and tests—not the OBS plugin itself.

The same repo also holds **[Vocal Studio](#vocal-studio)**, a browser remote that cleans up your mic and feeds the result to OBS. It uses the same popout remote, local server, and OBS client.

## Requirements

- Node.js 22 or newer.
- OBS Studio with its WebSocket server enabled (Tools → WebSocket Server Settings). Keep authentication enabled.
- **[Exeldro's obs-shaderfilter plugin](https://github.com/exeldro/obs-shaderfilter)**. Download the appropriate installer from its [releases](https://github.com/exeldro/obs-shaderfilter/releases), install, and restart OBS. The required effect filter is **User-defined shader** (`shader_filter`).
- Insta360 X5 connected over USB in Webcam mode, already added as a Video Capture Device in OBS.
- Chrome or Edge for the always-on-top Document Picture-in-Picture remote. The ordinary page also works without PiP.

**Current scope:** developed on macOS with OBS 32.2.2 and obs-shaderfilter 2.6.0. The bridge reads the existing macOS OBS WebSocket config; automatic capture setup and health checks are macOS-specific. Windows/Linux are not currently supported by these scripts without adapting configuration paths and capture properties.

## Quick start

From this folder:

```sh
node --version
npm test
npm run setup -- --source "Video Capture Device"
```

The last command only inspects OBS and prints a plan. Use the exact source name shown in your OBS Sources list. If omitted, setup tries to find exactly one X5 source.

Apply the reviewed plan, then start the remote:

```sh
npm run setup -- --source "Video Capture Device" --apply
npm start
```

Open **http://127.0.0.1:4785/**. No `npm install` is necessary. Keep OBS and the server running. Ctrl-C stops the server.

If port 4785 is already in use by an earlier copy of this controller, stop that copy first. Keeping the same browser and origin preserves its locally saved spots and preferences.

## Camera mode matters

In the camera source's Properties, disable **Use Preset** and select **2880×1440 at 30 FPS**. This selects the camera's stitched 2:1 panorama. A High preset can instead produce a split-screen view which this shader cannot interpret. Recheck the mode and selected device after unplugging/replugging.

This follows [Insta360's X5 OBS instructions](https://onlinemanual.insta360.com/x5/en-us/camera/appuse/obs). The shader does **not** stitch raw fisheye lenses; it projects the already-stitched panorama into a rectilinear view. No automatic leveling is applied.

## What setup changes—and does not

`scripts/setup.mjs` connects to the local OBS WebSocket server using the existing password without printing it. It verifies the selected camera is available, the plugin is installed, and a matching capture format is advertised.

With `--apply`, it writes a private, git-ignored snapshot under `backups/`, changes only the selected source's capture-mode fields, attaches the shader via its absolute path, and enables that filter. It reuses an existing X5 shader filter and preserves its rotation/zoom settings. Unrelated filters and scene layouts are left alone. It does not install software, enable WebSocket, create camera sources, start streaming/recording, or grant permissions.

If a request fails midway, earlier changes may already have applied; inspect OBS and the printed backup. Backups record the original input settings and filters for manual recovery; there is no automatic rollback command. To undo a new attachment, remove only **X5 View** from that source's Filters and restore its capture settings. To undo an update, restore the previous shader path/settings from the backup.

If setup cannot enumerate formats, manually disable Use Preset and choose the required format, then rerun. If you move this repo later, rerun setup to update the absolute shader path. Check the OBS preview after setup: setting readback cannot prove shader compilation or correct visual output.

## Manual shader installation

1. Right-click the X5 source → Filters → Effect Filters → **User-defined shader**.
2. Enable **Load shader text from file**. Leave **Use Effect File (.effect)** unchecked.
3. Browse to `shaders/insta360-x5-flat-view.shader` in this repo.
4. Click **Reload effect** after editing the shader.
5. Run `npm start` and open the controller.

The remote discovers the filter by this filename. Use one matching source/filter to avoid ambiguity. Webcam and desktop sources can be composed separately in OBS; this remote changes only the X5 view.

## Controls

The remote is a cube with one group of controls per face. Its four edges are outward-pointing chevrons: click an edge (or focus it and press Enter) to turn the cube that way, a face at a time; each face turns upright as it arrives. The current face's name is in the top-left corner. Hover the top-right corner for **▦ All**, which lays every face out flat so all controls show at once; **◆ Cube** goes back. The choice is remembered in the browser. The edge color is the connection status: grey while connecting, green when OBS and the camera checks pass, red when something needs attention.

| Face | Contents |
| --- | --- |
| Aim | Trackball with aim and roll buttons |
| Saved spots | Three saved spots, glide speed, and easing |
| Zoom & horizon | Zoom and horizon knobs, on a diagonal |
| Follow | Follow button, tracking state, and messages |
| Preview | Live filtered shot, with the tracking overlay while Follow is on |
| More | Reset view, movement speed, pan/tilt readout, status details, and Float |

| Control | Action |
| --- | --- |
| Globe drag | Rotate relative to the current camera view |
| Outer ring / roll knob | Roll around the viewing axis |
| Arrow buttons / keyboard arrows | Aim; hold for repeated movement |
| Q / E | Roll left / right |
| Shift | Fine movement |
| Zoom knob / + / − | Adjust field of view, bounded to 10–130° |
| Reset view | Return to the view captured when the page connected |
| Empty saved spot | Save current framing |
| Saved spot click | Glide to that framing |
| Hold a spot / right-click / Shift-click | Rename or replace with current view |
| Cube edges | Turn to the next face up, down, left, or right |
| ▦ All / ◆ Cube (top-right corner) | Show every control at once, or go back to the cube |

Glide duration: Cut, ½s, 1½s, 3s, or 5s. Easing: Linear, Smooth in/out, or Ease out. Rotation follows shortest-path quaternion interpolation, with zoom interpolated alongside it. Manual movement interrupts a glide.

Presets and preferences live in browser localStorage, not OBS or Git. Different browsers/profiles have different spots. Clearing site data deletes them. Keep one active remote to avoid competing updates.

## Follow and hand zoom

Click **◎ Follow** on the Follow face to keep yourself in frame. About eight times a second the remote grabs a small screenshot of the filtered X5 shot from OBS, finds your face, and nudges yaw and pitch to keep you centered with a little headroom. Only your head is needed, so sitting at a desk with your body cropped works. Follow aims between your eyes, nudged slightly toward the nose. MediaPipe Pose Landmarker (lite) first locates your head, which works when you are small in the shot, turned at an angle, or wearing a hat. MediaPipe Face Landmarker then reads a close crop around your head. On its own the face model misses faces that are small or turned, and the crop fixes that. If the face model still misses, Follow uses the pose model's nose, eye, and ear points. The face thresholds are set low enough that a hat covering your forehead still counts. It turns faster when you are near the edge of the shot. Horizon roll is left as you set it. A small dead zone keeps the camera from hunting.

While Follow is on, the Preview face shows a tracking view, and the Follow face shows the tracking state and hints. It shows what the model sees: your face outline, eyes, and lips in blue (or blue dots for nose, eyes, and ears when only the pose model has you), each detected hand in green, your tracked point in orange, and a box marking where Follow aims. The bar along the bottom is the push/pull meter. The white ticks are the thresholds; it turns orange when zooming out and blue when zooming in. The tracking view only appears in the remote, never in OBS.

Zoom with both hands, palms facing the camera:

- Push both hands toward the camera to zoom out.
- Pull both hands back toward your chest to zoom in.

MediaPipe Hand Landmarker measures how big each palm looks, compared with the distance from your eyes to your mouth. That distance shrinks and grows with the zoom exactly like your palms do, so zooming never reads as a push, and it barely changes when you turn your head. Pushing makes both palms look bigger. One hand, or hands moving in opposite directions, does nothing. Holding a pose stops zooming after a moment, so push again to keep going. Zoom waits while your face is not found. The tracking view shows "Show both hands" until both are detected.

To focus on your face and hands, hold both hands up beside your face, palms open toward the camera and fingers up, one hand on each side. Follow frames your face and both hands together, centered, so they fill about 80% of the shot. A dashed orange box in the tracking view shows the framing, and the button reads **Focusing**. The hands must be around face height, open (a fist does not count), and turned toward the camera (an edge-on hand does not count). Push/pull zoom pauses while you hold the pose. Drop either hand and Follow eases back to the zoom you had before and goes back to following your face.

If you leave the shot, for example by standing up in a tight frame, Follow waits briefly and then widens to about 100° (**Searching…**) to find you. Once it has you again, it eases back to your zoom. If you are still not found at full width, it shows **Holding**. Follow only sees the current shot and does not search the rest of the 360° sphere. Manual aiming, zoom, and saved-spot glides pause Follow for two seconds. The models, wasm runtime, and JavaScript bundle (Apache-2.0, `@mediapipe/tasks-vision` 1.1.0) are vendored in `controller/vendor/mediapipe/` and served locally; nothing is sent to Google or any other service. The first click takes a few seconds to load about 30 MB of model files.

Click **Float above other windows** on the More face to open the cube in PiP. Keep the originating tab open. Browser/OS minimum window sizes may limit how small it can become. Keyboard shortcuts require focus in the remote; they are not global OBS hotkeys.

The cube edges are green when device availability, configured capture mode, and enabled filter checks pass; red means attention is needed. The More face lists the details. It polls every three seconds. It does not verify frame freshness, image quality, or successful shader compilation.

## Architecture and security

```text
Browser remote → local Node bridge → OBS WebSocket → shader filter → OBS output
```

The trackball composes quaternions, converting to the shader's yaw/pitch/roll transport format. The shader samples the panorama with longitude wrapping. It preserves the source dimensions; arrange/crop the result in OBS as desired.

The HTTP bridge binds only to `127.0.0.1:4785`, checks Host/Origin, and accepts numeric view fields only. The OBS password remains server-side, read from `~/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json`. Never commit that file, OBS credentials, or private scene backups. Do not expose this server publicly; it has no user-login layer. The local screenshot endpoint is used only while Follow is on; frames stay in the browser for face and hand detection.

## Vocal Studio

A browser remote that runs your mic through voice effects and sends the result to OBS. It replaces the earlier native Swift app.

```sh
npm run vocal
```

Open **http://127.0.0.1:4791/** in Chrome, or double-click `vocal/Open Vocal Studio.command`, which starts the server if needed and opens the page. Choose a **DJI Mic Mini** or **AirPods** preset, pick your microphone, and click **Start**. Allow the microphone when Chrome asks. **Float above other windows** and **Compact** work the same as in the X5 remote. Keep the tab open while you use the processed voice; closing it stops the audio.

```text
Mic → rumble cut / EQ → noise expansion → compression → optional room → peak limiter
    → WebSocket to the local server → http://127.0.0.1:4791/live.wav → OBS media source
```

The effects run in the page with Web Audio. Chrome's own echo cancellation, noise suppression, and auto gain are turned off so they do not color your voice. Audio is sent to OBS as 48 kHz mono. Mute silences the processed stream. Effects off skips tone, dynamics, and room but keeps peak protection. Your chosen preset and mic are remembered in the browser.

Start creates or reuses **Vocal Studio · Processed Mic** in OBS's current scene. If a raw OBS mic input uses the same microphone, it is muted, but only after OBS confirms the processed stream is playing. This includes inputs set to the macOS **Default** device when that default is the mic you picked. Previous settings and mute states are saved to a private `vocal-studio-obs-*.json` file in the macOS temporary directory. To return to raw audio, mute or remove the processed source and unmute the original mic in OBS. OBS's media source may add some latency, so check sync against your camera before going live.

Presets are starting points, not calibrations measured against your voice. Bluetooth microphones such as AirPods run at reduced bandwidth, and EQ cannot restore it.

## Layout and development

```text
lib/obs.mjs                 Authenticated OBS WebSocket client (shared)
lib/local-server.mjs        Loopback HTTP server: Host/Origin checks, JSON, files (shared)
lib/ui-sync.mjs             Compact layout sync across open remotes (shared)
lib/ws.mjs                  Minimal WebSocket endpoint for browser audio (shared)
lib/web/remote-shell.js     Popout, compact toggle and layout sync for both remotes (shared)
controller/index.html       X5 UI, trackball, presets, glides
controller/server.mjs       X5 API on 127.0.0.1:4785
controller/tracking.mjs     Follow head crop, face aim, two-hand zoom, and palms-beside-face framing math
controller/vendor/mediapipe Pose, Face, and Hand Landmarker models, wasm runtime, bundle
vocal/web/                  Vocal Studio page, styles, presets and audio worklets
vocal/server.mjs            Vocal Studio server on 127.0.0.1:4791 and the OBS WAV stream
vocal/setup-obs.mjs         Creates the OBS media source and mutes the duplicate raw mic
shaders/insta360-x5-flat-view.shader
scripts/setup.mjs           Dry-run / apply setup
```

Each app keeps its own CSS; behavior shared by both lives in `lib/`. Run `npm test`. Tests cover quaternion/Euler round trips including poles, shortest-path glide wrap, knob wrap, JavaScript syntax, Follow aim direction and dead zone, face aim from the eyes and nose, the pose fallback and head crop (scale holds when the head turns), two-hand zoom (both hands and a head required, unaffected by the current zoom, held pose settles), palms-beside-face framing (open palms on both sides at face height; fists, one side, or hands at the desk ignored; return to the earlier zoom), widening to search when you are lost, vocal presets and chain mapping, mic-name matching between Chrome and OBS, and WebSocket framing through the shared server. Live OBS setup, disconnect/reconnect, PiP sizing, and visual output still need integration checks on the target machine.

## Credits

Requires the separately installed [obs-shaderfilter](https://github.com/exeldro/obs-shaderfilter) by Exeldro and contributors, plus OBS Studio. Not an official Insta360 or OBS product. The plugin's source and binaries are not bundled here.
