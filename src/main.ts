import './style.css';
import { mount } from 'svelte';
import App from './App.svelte';
import './jwtVerifier'
// import { initializeAuthFlow } from './auth'; // Removed import

const app = mount(App, {
  target: document.getElementById('app')!,
});

// initializeAuthFlow(); // Removed call, logic moved to AuthFlow.svelte's onMount

export default app;
