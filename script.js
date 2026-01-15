// Auto update year
document.getElementById("year").textContent = new Date().getFullYear();

// Typing effect for name
const nameEl = document.getElementById("typing-name");
const nameText = "Muhammad Hadi";
let i = 0;

function typeName() {
    if(i < nameText.length){
        nameEl.innerHTML += nameText.charAt(i);
        i++;
        setTimeout(typeName, 150);
    }
}
typeName();
