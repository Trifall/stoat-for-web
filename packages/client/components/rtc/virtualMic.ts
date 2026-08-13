export const stoatSinkName = "stoat-virtual-source";

export const isStoatSinkDevice = (device: MediaDeviceInfo) =>
  device.kind === "audioinput" && device.label.includes(stoatSinkName);

export function setupVirtualMic() {
  const isWayland = window.native?.isWayland?.();
  if (typeof isWayland === "boolean" && isWayland) {
    const original = navigator.mediaDevices.getDisplayMedia;

    async function getVirtmic() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevice = devices.find(isStoatSinkDevice);
        return audioDevice?.deviceId;
      } catch {
        return null;
      }
    }

    navigator.mediaDevices.getDisplayMedia = async function (opts) {
      const stream: MediaStream = await original.call(this, opts);
      if (opts && !opts.audio) return stream;
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

      return stream;
    };
  }
}
