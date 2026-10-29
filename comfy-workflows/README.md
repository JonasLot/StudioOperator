# Local workflows (ComfyUI)

&more Design's **Local · ComfyUI image** and **Local · ComfyUI video** models run on your own machine
through [ComfyUI](https://github.com/comfyanonymous/ComfyUI). They cost nothing and need no API key.

## Set up

1. Start ComfyUI (default `http://127.0.0.1:8188`; change with `COMFYUI_URL`).
2. Build the workflow you want in ComfyUI, with your own checkpoint, LoRAs and so on.
3. Enable *Dev mode options* in ComfyUI's settings, then **Save (API Format)**.
4. Save the file here as `image.json` (for the image model) and/or `video.json` (for the video model).
5. Replace the values you want &more Design to control with placeholders (see below).
6. In &more Design, turn mock mode off (Settings → Mock mode → Live) and pick a *Local · ComfyUI* model on a step.
   Settings → *Run a provider connection test* checks ComfyUI and that the templates exist.

`image.example.json` is a minimal SDXL-style graph to copy from. Change `ckpt_name` to a checkpoint you have.

## Placeholders

Any string value that is exactly `"{{name}}"` is replaced, and keeps its type (a number stays a number).

| Placeholder | Value |
| --- | --- |
| `{{prompt}}` | the step's prompt |
| `{{seed}}` | a random integer |
| `{{width}}`, `{{height}}` | pixels, from the deliverable's aspect ratio (long side `COMFYUI_IMAGE_SIZE` / `COMFYUI_VIDEO_SIZE`) |
| `{{duration}}`, `{{fps}}`, `{{frames}}` | seconds, 24, and duration × 24 (video) |

The workflow must end in a **Save Image** node (image) or a Save Video / Video Combine node (video), otherwise
the take fails with "saved no output". Unknown placeholders are reported instead of sent.

## Limits

Reference images from earlier steps are not passed to local workflows yet, and there is no local voice model.
Outputs are copied into the app's own database like any other take, so large videos grow `data/studio.db`.
