import WrappedView from './WrappedView.vue';
import { setCtx } from './runtime';

export default {
    id: 'vrc-wrapped',
    name: 'VRChat Wrapped',
    description: 'A beautiful dashboard summarizing your VRChat playtime, top friends, and most visited worlds.',
    
    setup(ctx) {
        setCtx(ctx);
        // Register the view in the UI
        ctx.ui.addNavView({
            key: 'mod-vrc-wrapped',
            icon: 'ri-medal-line',
            label: {
                en: 'VRC Wrapped'
            },
            component: WrappedView
        });

        // Extend the context with our custom database functions
        // So the Vue component can access them easily
        import('./db.js').then(db => {
            ctx.wrappedDb = db;
        }).catch(err => {
            console.error('[VRC Wrapped] Failed to load db module:', err);
        });
    }
};
