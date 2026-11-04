// "Ask the server again and redraw." Several parts of the page need it (after a save, after a run), and the function that does it needs all of
// them to draw, so it is registered here once at start-up (main.js) and called from anywhere without the parts importing one another in a circle.

let loader = async () => {};

export const setReload = fn => {
  loader = fn;
};

export const reload = () => loader();
