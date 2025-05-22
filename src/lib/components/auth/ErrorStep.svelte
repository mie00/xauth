<script lang="ts">
  const { errorMessage = null, ontryagain }: { errorMessage: string | null, ontryagain: () => void } = $props();
</script>

<div class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
  <h2 class="text-2xl font-semibold mb-4 text-red-400">Authentication Error</h2>
  <p class="text-gray-300 mb-4">{errorMessage || "An unexpected error occurred."}</p>
  <div class="flex justify-center">
    <button class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" onclick={ontryagain}>Try Again</button>
  </div>
</div>
