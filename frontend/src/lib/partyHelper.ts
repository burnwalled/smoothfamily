// A helper from outside on their own page (3.4.0): their calls say so, so that a browser that's also
// signed in to the app acts as the helper there, and what they see isn't kept on the device.
let on = false;

export const setPartyHelper = (value: boolean) => {
  on = value;
};
export const isPartyHelper = () => on;
