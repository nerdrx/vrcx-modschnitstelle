// ============================================================================
// Orbit Graph mod — social graph from LOCAL gamelog co-presence.
//
// Not the friend list: the graph is reconstructed from the instances VRCX
// already recorded (gamelog_location + gamelog_join_leave). It shows everyone
// who shared an instance with you — friends AND strangers — how long you were
// together, and which of those people keep showing up together themselves.
//
// Read-only, zero VRChat API calls: all graph data comes from the local DB.
// ============================================================================

import OrbitGraphView from './OrbitGraphView.vue';
import { setCtx } from './runtime';

export default {
    id: 'orbitgraph',
    name: 'Orbit Graph',
    version: '2.1.0',

    setup(ctx) {
        setCtx(ctx);
        ctx.ui.addNavView({
            key: 'mod-orbit-graph',
            component: OrbitGraphView,
            icon: 'ri-node-tree',
            label: {
                en: 'Orbit Graph',
                de: 'Orbit Graph'
            }
        });
    }
};
