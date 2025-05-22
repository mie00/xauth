<script lang="ts">
  import "./style.css"; // Global styles
  import AuthFlow from './lib/components/AuthFlow.svelte';
</script>

<main class="p-8 flex flex-col justify-center items-center min-h-screen bg-gray-900 text-gray-100">
  <div class="container p-4 max-w-lg w-full"> {/* Adjusted max-width and added w-full for better layout */}
    <h1 class="text-3xl font-bold text-indigo-400 mb-6 text-center">
      Client-Side Authentication Demo
    </h1>
    <AuthFlow />
  </div>
</main>

<style>
  /* Ensure main takes full height if not already by global styles */
  main {
    min-height: 100vh;
  }
</style>
