// Welcome to Gemini Lite Editor
// We've generated a simple counter app for you to try out.

const app = document.getElementById('app');
app.style.display = 'flex';
app.style.flexDirection = 'column';
app.style.alignItems = 'center';
app.style.justifyContent = 'center';
app.style.height = '100vh';

const title = document.createElement('h1');
title.textContent = 'Hello, Gemini!';
title.style.fontSize = '2rem';
title.style.marginBottom = '1rem';
app.appendChild(title);

const counter = document.createElement('button');
counter.textContent = 'Count: 0';
counter.style.padding = '10px 20px';
counter.style.fontSize = '1.2rem';
counter.style.cursor = 'pointer';
counter.style.background = '#3b82f6';
counter.style.color = 'white';
counter.style.border = 'none';
counter.style.borderRadius = '8px';

let count = 0;
counter.onclick = () => {
  count++;
  counter.textContent = 'Count: ' + count;
};

app.appendChild(counter);

console.log("App initialized successfully!");
