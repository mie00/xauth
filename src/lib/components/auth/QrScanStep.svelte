<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import jsQR from 'jsqr';

  let videoElement: HTMLVideoElement | null = $state(null); // Bound from this component's template
  let canvasElement: HTMLCanvasElement | null = $state(null); // Bound from this component's template
  
  let internalQrScanError: string | null = $state(null);
  let internalIsScanning: boolean = $state(false);
  let internalMediaStream: MediaStream | null = $state(null);
  let animationFrameId: number | null = $state(null);

  const { onscanned, onscanerror, onmanualinput, onback }: 
    { 
      onscanned: (data: string) => void, 
      onscanerror: (error: string) => void, 
      onmanualinput: () => void, 
      onback: () => void 
    } = $props();

  async function startQrScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      internalQrScanError = "QR scanning is not supported by your browser (getUserMedia API missing).";
      console.error(internalQrScanError);
      onscanerror(internalQrScanError);
      return;
    }
    internalIsScanning = true;
    internalQrScanError = null;
    try {
      internalMediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoElement && internalMediaStream) {
        videoElement.srcObject = internalMediaStream;
        videoElement.setAttribute("playsinline", "true"); // Important for iOS
        await videoElement.play();
        tick();
      } else {
        internalQrScanError = "Video element or media stream not available after camera access.";
        console.error(internalQrScanError);
        onscanerror(internalQrScanError);
        stopQrScan();
      }
    } catch (err: any) {
      console.error("Error accessing camera for QR scan:", err);
      internalQrScanError = `Could not access camera: ${err.name} - ${err.message}. Try manual input.`;
      onscanerror(internalQrScanError);
      stopQrScan(); // Ensure cleanup if start fails
    }
  }

  function stopQrScan() {
    internalIsScanning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (internalMediaStream) {
      internalMediaStream.getTracks().forEach(track => track.stop());
      internalMediaStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
      // Attempt to pause and clear video element to release resources
      if (!videoElement.paused) {
        videoElement.pause();
      }
      videoElement.removeAttribute('src'); // Try to remove the source
      videoElement.load(); // Request browser to load/clear element
    }
    console.log("QR Scanner stopped.");
  }

  function tick() {
    if (!internalIsScanning || !videoElement || !canvasElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
      if (internalIsScanning) animationFrameId = requestAnimationFrame(tick);
      return;
    }
    const canvasCtx = canvasElement.getContext('2d', { willReadFrequently: true });
    if (canvasCtx) {
      canvasElement.height = videoElement.videoHeight;
      canvasElement.width = videoElement.videoWidth;
      canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
      const imageData = canvasCtx.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        console.log("QR Code detected:", code.data);
        stopQrScan();
        onscanned(code.data);
      } else {
        if (internalIsScanning) animationFrameId = requestAnimationFrame(tick);
      }
    } else {
      if (internalIsScanning) animationFrameId = requestAnimationFrame(tick);
    }
  }

  onMount(() => {
    startQrScan();
  });

  onDestroy(() => {
    stopQrScan();
  });

  function switchToManual() {
    stopQrScan(); // Stop scanning before dispatching
    onmanualinput();
  }

  // No handleBack needed, onback prop can be called directly if a button is for that.
  // The existing button calls onback directly.
</script>

<div id="qrScanImportSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
  <h2 class="text-2xl font-semibold mb-4 text-gray-100">Scan QR Code to Import Key</h2>
  <p class="text-gray-300 mb-4">Point your camera at the QR code containing your encrypted account key.</p>
  <div class="relative w-full max-w-md mx-auto aspect-square bg-gray-700 rounded overflow-hidden mb-4">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={videoElement} class="w-full h-full object-cover" playsinline autoplay muted></video>
    {#if !internalIsScanning && !internalQrScanError && !internalMediaStream}
      <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
        <p class="text-gray-200">Initializing camera...</p>
      </div>
    {/if}
  </div>
  <canvas bind:this={canvasElement} class="hidden"></canvas> 
  {#if internalQrScanError}
    <p class="text-red-400 mb-4">{internalQrScanError}</p>
  {/if}
  <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
    <button
      class="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
      onclick={switchToManual}
    >
      Switch to Manual Input
    </button>
    <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" onclick={onback}>Back</button>
  </div>
</div>
