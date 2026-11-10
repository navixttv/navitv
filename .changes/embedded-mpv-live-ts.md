---
type: fix
area: playback
---

Embedded MPV plays live channels again when the stream format is Auto: it now starts on the provider's TS stream instead of an HLS stream many providers advertise but do not serve.
