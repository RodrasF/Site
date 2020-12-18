const images = [];
const delay = 1500;
let spinning = false;

function getImages() {
    let imgs = document.getElementsByTagName('img');
    for (let i = imgs.length - 1; i >= 0; i--) {
        let img = {
            obj: imgs[i],
            coords: {
                x: parseFloat(getComputedStyle(imgs[i]).left),
                y: parseFloat(getComputedStyle(imgs[i]).top)
            },
            seed: 0.0,
            animation_id: null
        }
        images.push(img);
    }
}

function spiral(image) {
    const radius = 300.0;
    const speed_modifier = 1/delay * 60;
    const easing_modifier = -0.01; // The lower  -> more ease

    let easing_function = -1.0 * Math.pow(2, easing_modifier * image.seed) + 1;
    let new_x = radius * Math.sin(speed_modifier * image.seed) * easing_function;
    let new_y = radius * Math.sin((speed_modifier * image.seed) + (Math.PI/2.0)) * easing_function;

    image.obj.style.left = `${image.coords.x + new_x}px`;
    image.obj.style.top = `${image.coords.y + new_y}px`;
    
    image.seed += 1.0;

    let anim_id = requestAnimationFrame(() => {
        spiral(image);
    })
    image.animation_id = anim_id;
}

$(".spiral").hover(
    function(event) {
        if(spinning == true) return;

        spinning = true;
        console.log("Mouse entered");
        let index = 0;
        spiral(images[index++]);
        let interval = setInterval(() => {
            spiral(images[index++]);
            if(index == images.length) 
                clearInterval(interval);
        }, delay);
    },
    function (event) {
        // The mouse has left the element, can reference the element via 'this'
    }
 );

window.onload = getImages;