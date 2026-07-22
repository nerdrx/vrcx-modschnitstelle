import WrappedView from './WrappedView.vue';

export default {
    id: 'vrc-wrapped',
    name: 'VRChat Wrapped',
    description: 'A beautiful dashboard summarizing your VRChat playtime, top friends, and most visited worlds.',
    
    setup(ctx) {
        // Register the view in the UI
        ctx.ui.addNavView({
            id: 'mod-vrc-wrapped',
            icon: 'ri-medal-line',
            label: 'VRC Wrapped',
            component: WrappedView,
            order: 95
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
