const btn = document.getElementById('btn');
const counter = document.getElementById('counter');
const message = document.getElementById('message');
let n = 0;
btn.addEventListener('click', () => {
  n++;
  counter.textContent = 'Clics : ' + n;
  message.textContent = n >= 5 ? 'Bravo, le test est réussi ! 🎉' : 'Le JavaScript fonctionne ✅';
});
