var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const log = console.log;
let remoteAudioSource,
  remoteAnalyser,
  isMirrored = true;
const localPeerConnectionLoop = cfg => {
  const setD = (d, a, b) =>
    Promise.all([a.setLocalDescription(d), b.setRemoteDescription(d)]);
  return [0, 1]
    .map(() => new RTCPeerConnection(cfg))
    .map((pc, i, pcs) =>
      Object.assign(pc, {
        onicecandidate: e =>
          e.candidate && pcs[i ^ 1].addIceCandidate(e.candidate),
        onnegotiationneeded: async e => {
          try {
            await setD(await pc.createOffer(), pc, pcs[i ^ 1]);
            await setD(await pcs[i ^ 1].createAnswer(), pcs[i ^ 1], pc);
          } catch (e) {
            log(e);
          }
        }
      })
    );
};
let [pc1, pc2] = localPeerConnectionLoop({
  sdpSemantics: "unified-plan",
  mandatory: {
    googHighpassFilter: false,
    googEchoCancellation: false,
    googEchoCancellation2: false,
    googAutoGainControl: false,
    googAutoGainControl2: false,
    googNoiseSuppression: false,
    googNoiseSuppression2: false,
    googTypingNoiseDetection: false,
    echoCancellation: false,
    googAudioMirroring: true
  }
});
let transceiver, streams, trackA, trackB;
pc2.ontrack = ({ transceiver, streams: [stream] }) => {
  log("pc.ontrack with transceiver and streams");

  stream.onaddtrack = () => log("stream.onaddtrack");
  stream.onremovetrack = () => log("stream.onremovetrack");
  transceiver.receiver.track.onmute = () =>
    log("transceiver.receiver.track.onmute");
  transceiver.receiver.track.onended = () =>
    log("transceiver.receiver.track.onended");
  transceiver.receiver.track.onunmute = () => {
    log("transceiver.receiver.track.onunmute");
    document.getElementById("remoteAudio").srcObject = stream;
    remoteAudioSource = audioCtx.createMediaStreamSource(stream);
    remoteAudioSource.connect(remoteAnalyser);
  };
};

let osc, gainNode, analyser, peerStream;

const updateFrequency = e => {
  const freq = +e.target.value;
  osc.frequency.value = freq;
  document.getElementById("freq").textContent = freq;
};
const pause = () => {
  gainNode.gain.value ^= 1;
};
const changeMonitoringAudio = e => {
  if (e.target.value === "local") {
    analyser.connect(audioCtx.destination);
    remoteAnalyser.disconnect(audioCtx.destination);
  } else {
    remoteAnalyser.connect(audioCtx.destination);
    analyser.disconnect(audioCtx.destination);
  }
};
const changeDisplayMethod = e => {
  isMirrored = e.target.value === "mirrored";
};
const initApp = () => {
  document.getElementById("slider").addEventListener("input", updateFrequency);
  osc = audioCtx.createOscillator();
  window.osc = osc;
  gainNode = audioCtx.createGain();
  analyser = audioCtx.createAnalyser();
  remoteAnalyser = audioCtx.createAnalyser();
  peerStream = audioCtx.createMediaStreamDestination();
  analyser.fftSize = 256;
  remoteAnalyser.fftSize = 256;
  osc.frequency.value = 1000;
  osc.connect(gainNode);
  gainNode.connect(analyser);
  gainNode.connect(peerStream);

  remoteAnalyser.connect(audioCtx.destination);

  streams = [peerStream.stream];
  trackA = streams[0].getTracks()[0];
  /* bind events */
  [
    ["turnOn", "click", turnOn],
    ["pause", "click", pause],
    ["localRadio", "change", changeMonitoringAudio],
    ["remoteRadio", "change", changeMonitoringAudio],
    ["duplicated", "change", changeDisplayMethod],
    ["mirrored", "change", changeDisplayMethod]
  ].forEach(([id, event, func]) =>
    document.getElementById(id).addEventListener(event, func)
  );
};
let cv, ctx, bufferLength, dataArray, remoteDataArray;

const updateSpectrum = () => {
  requestAnimationFrame(updateSpectrum);
  analyser.getFloatFrequencyData(dataArray);
  remoteAnalyser.getFloatFrequencyData(remoteDataArray);

  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "rgb(0, 0, 0)";
  ctx.fillRect(0, 0, cv.width, cv.height);

  var barWidth = (cv, cv.width / bufferLength) * 2.5;
  var barHeight;
  var x = 0;

  for (var i = 0; i < bufferLength; i++) {
    barHeight = (dataArray[i] + 140) * 2;

    ctx.fillStyle = `rgba(${~~(barHeight + 100)},50,50,0.5)`;
    ctx.fillRect(x, cv.height - barHeight, barWidth, barHeight);

    /* remoteSpectrum is mirrored */
    barHeight = (remoteDataArray[i] + 140) * 2;

    ctx.fillStyle = `rgba(50,50,${~~(barHeight + 100)},0.5)`;
    ctx.fillRect(
      x,
      isMirrored ? 0 : cv.height - barHeight,
      barWidth,
      barHeight
    );

    x += barWidth + 1;
  }
};
const turnOn = async () => {
  osc.start();
  transceiver = pc1.addTransceiver(trackA, { streams });
  cv = document.getElementById("spectrum");
  ctx = cv.getContext("2d");

  bufferLength = analyser.frequencyBinCount;
  dataArray = new Float32Array(bufferLength);
  remoteDataArray = new Float32Array(bufferLength);
  updateSpectrum();
};
document.addEventListener("DOMContentLoaded", initApp);
