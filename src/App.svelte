<script lang="ts">
  import "./style.css"; // Ensure global styles are applied if not handled globally in main.ts for Svelte
                       // Or, if main.ts imports it, this might be redundant or for component-specific styles.
                       // For now, let's keep it here to ensure Tailwind is active within Svelte context.
                       // Typically, global styles are imported once in main.ts or App.svelte.

  let name: string = 'Svelte 5 User';
</script>

<main class="p-8 flex flex-col justify-center items-center min-h-screen">
  <div class="container p-4 max-w-md flex flex-col items-center text-center">
    <h1 class="text-3xl font-bold text-indigo-400 mb-6">
      Welcome, {name}!
    </h1>
    <p class="text-gray-300">
      Your Svelte 5 application is ready.
    </p>
    <p class="text-gray-400 mt-4 text-sm">
      Next steps: Migrate UI and authentication logic into Svelte components.
    </p>
  </div>
</main>

<style>

</style>
