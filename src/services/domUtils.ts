import { View } from '@nativescript/core';

export const blink = (event: any, callback?: () => void) => {
    const view = event.object as View;
    view.animate({
        opacity: 0.2,
        duration: 200,
    }).then(() => {
        view.animate({
            opacity: 1,
            duration: 200,
        });
    });
    if (callback) {
        callback();
    }
};
