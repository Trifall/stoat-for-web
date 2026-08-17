import { getVirtmic } from "./virtualMic";

export { useVoice, VoiceContext } from "./state";

export { InRoom } from "./components/InRoom";
export { RoomAudioManager } from "./components/RoomAudioManager";
export { isStoatSinkDevice, stoatSinkName } from "./virtualMic";

const originalMediaCall = navigator.mediaDevices.getDisplayMedia;

navigator.mediaDevices.getDisplayMedia = async function (opts) {
  // Hard overwrite the track constraints so that we -never ever- get a track
  // that is over 720p when requesting a new video track
  if (opts?.video) {
    opts.video = {
      ...(typeof opts.video === "object" ? opts.video : {}),
      frameRate: { ideal: 5, max: 5 },
      width: { ideal: 640, max: 640 },
      height: { ideal: 480, max: 480 },
    };
  }

  const stream: MediaStream = await originalMediaCall.call(this, opts);

  const isWayland = window.native?.isWayland?.();
  if (opts && opts.audio && typeof isWayland === "boolean" && isWayland) {
    const id = await getVirtmic();

    console.debug("Virt mic acquired:", id);

    if (id) {
      try {
        const audio = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: {
              exact: id,
            },
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            channelCount: 2,
            sampleRate: 48000,
            sampleSize: 16,
          },
        });

        const virtualTrack = audio.getAudioTracks()[0];
        if (virtualTrack) {
          stream.getAudioTracks().forEach((track) => {
            stream.removeTrack(track);
            track.stop();
          });

          stream.addTrack(virtualTrack);
        }
      } catch (error) {
        console.warn("Failed to acquire virtual mic:", error);
      }
    }
  }

  return stream;
};
