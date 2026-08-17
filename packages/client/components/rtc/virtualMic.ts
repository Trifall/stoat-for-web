export const stoatSinkName = "stoat-virtual-source";

export const isStoatSinkDevice = (device: MediaDeviceInfo) =>
  device.kind === "audioinput" && device.label.includes(stoatSinkName);

export async function getVirtmic() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevice = devices.find(isStoatSinkDevice);
    return audioDevice?.deviceId;
  } catch {
    return null;
  }
}
