const api = window.launcherApi;
const output = document.getElementById("log-output");
const clearBtn = document.getElementById("clear-log");
const autoScrollBtn = document.getElementById("auto-scroll-btn");

let autoScrollEnabled = true;

function setAutoScroll(enabled) {
  autoScrollEnabled = enabled;
  autoScrollBtn.classList.toggle("active", enabled);
}

autoScrollBtn.addEventListener("click", () => {
  setAutoScroll(!autoScrollEnabled);
});

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("pt-BR");
}

function appendLogLine(event) {
  const prefix = event.type ? `[${event.type}]` : "[log]";
  const line = `${formatTime(event.time || Date.now())} ${prefix} ${event.message}`;
  output.textContent += (output.textContent.length > 0 ? "\n" : "") + line;
  if (autoScrollEnabled) {
    output.scrollTop = output.scrollHeight;
  }
}

api.onLogInit((history) => {
  output.textContent = "";
  history.forEach(appendLogLine);
});

api.onLogEvent((event) => {
  appendLogLine(event);
});

clearBtn.addEventListener("click", () => {
  output.textContent = "";
});
