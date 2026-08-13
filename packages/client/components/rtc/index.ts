import { setupVirtualMic } from "./virtualMic";

export { useVoice, VoiceContext } from "./state";

export { InRoom } from "./components/InRoom";
export { RoomAudioManager } from "./components/RoomAudioManager";
export { isStoatSinkDevice, stoatSinkName } from "./virtualMic";

setupVirtualMic();
