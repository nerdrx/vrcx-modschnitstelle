import OrbitGraphView from './OrbitGraphView.vue';
import { setCtx } from './runtime';

export default {
    id: 'orbitgraph',
    name: 'Orbit Graph',
    version: '1.0.0',
    setup(ctx) {
        setCtx(ctx);
        ctx.ui.addNavView({
            key: 'mod-orbit-graph',
            icon: 'ri-node-tree',
            component: OrbitGraphView,
            label: {
                en: 'Orbit Graph',
                de: 'Orbit Graph'
            }
        });
    }
};
