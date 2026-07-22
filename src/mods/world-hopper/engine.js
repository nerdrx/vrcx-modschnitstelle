// ============================================================================
// World Hopper — Route Planner Engine & Parsing Utilities
// ============================================================================

/**
 * Parse a raw world/instance input string, link, or launch URI into a clean location tag.
 * Handles formats like:
 * - wrld_12345678-1234-1234-1234-123456789abc
 * - wrld_12345678-1234-1234-1234-123456789abc:12345~region(eu)
 * - https://vrchat.com/home/launch?worldId=wrld_xxx&instanceId=12345~region(us)
 * - https://vrchat.com/home/world/wrld_xxx
 * - vrchat://launch?ref=vrchat.com&id=wrld_xxx:12345
 *
 * @param {string} input
 * @returns {{ location: string, worldId: string, instanceId: string|null, isValid: boolean }}
 */
export function parseWorldInput(input) {
    if (!input || typeof input !== 'string') {
        return { location: '', worldId: '', instanceId: null, isValid: false };
    }

    const str = input.trim();
    if (!str) {
        return { location: '', worldId: '', instanceId: null, isValid: false };
    }

    let location = '';

    // Check for VRChat URL with query params (worldId, instanceId)
    if (str.includes('worldId=')) {
        try {
            const url = new URL(str.startsWith('http') ? str : `https://${str}`);
            const worldId = url.searchParams.get('worldId') || '';
            const instanceId = url.searchParams.get('instanceId') || url.searchParams.get('instance') || '';
            if (worldId.startsWith('wrld_')) {
                location = instanceId ? `${worldId}:${instanceId}` : worldId;
            }
        } catch {
            // fall through to regex parsing
        }
    }

    // Check for vrchat.com/home/world/wrld_xxx
    if (!location && str.includes('/home/world/')) {
        const match = str.match(/(wrld_[a-f0-9-]+)/i);
        if (match) {
            location = match[1];
        }
    }

    // Check for launch URI: id=wrld_xxx:yyy
    if (!location && str.includes('id=')) {
        const match = str.match(/id=(wrld_[a-f0-9-]+(?::[^\s&]+)?)/i);
        if (match) {
            location = match[1];
        }
    }

    // Direct location pattern: wrld_xxx or wrld_xxx:yyy
    if (!location) {
        const match = str.match(/(wrld_[a-f0-9-]+(?::[^\s]+)?)/i);
        if (match) {
            location = match[1];
        } else {
            // If user typed custom string without wrld_ prefix (e.g. just ID), keep as-is if reasonably formatted
            location = str;
        }
    }

    const sep = location.indexOf(':');
    const worldId = sep >= 0 ? location.slice(0, sep) : location;
    const instanceId = sep >= 0 ? location.slice(sep + 1) : null;
    const isValid = location.length > 0;

    return {
        location,
        worldId,
        instanceId,
        isValid
    };
}

/**
 * Generate a unique ID for a playlist item.
 * @returns {string}
 */
export function generateItemId() {
    return `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Factory function to create a new structured playlist item object.
 * @param {object} params
 * @param {string} params.location
 * @param {string} [params.name]
 * @param {string} [params.note]
 * @param {string} [params.status]
 * @param {number} [params.orderIndex]
 * @returns {object}
 */
export function createPlaylistItem({ location, name = '', note = '', status = 'pending', orderIndex = 0 }) {
    const parsed = parseWorldInput(location);
    return {
        id: generateItemId(),
        location: parsed.location || location,
        worldId: parsed.worldId || location,
        instanceId: parsed.instanceId,
        name: name || '',
        note: note || '',
        status: status === 'visited' ? 'visited' : 'pending',
        orderIndex: orderIndex || 0,
        createdAt: new Date().toISOString()
    };
}

/**
 * Reorder playlist items safely.
 * @param {Array} items
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {Array} updated list with orderIndex reassigned
 */
export function reorderItems(items, fromIndex, toIndex) {
    if (!Array.isArray(items) || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
        return items ? [...items] : [];
    }

    const result = [...items];
    const [movedItem] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, movedItem);

    return result.map((item, idx) => ({
        ...item,
        orderIndex: idx
    }));
}

/**
 * Filter playlist items by search query and status.
 * @param {Array} items
 * @param {object} filterOptions
 * @param {string} [filterOptions.searchQuery]
 * @param {string} [filterOptions.statusFilter] 'all' | 'pending' | 'visited'
 * @returns {Array}
 */
export function filterPlaylist(items, { searchQuery = '', statusFilter = 'all' } = {}) {
    if (!Array.isArray(items)) return [];

    const q = (searchQuery || '').trim().toLowerCase();
    const sf = statusFilter || 'all';

    return items.filter((item) => {
        if (sf !== 'all' && item.status !== sf) {
            return false;
        }

        if (!q) {
            return true;
        }

        const nameMatch = (item.name || '').toLowerCase().includes(q);
        const locMatch = (item.location || '').toLowerCase().includes(q);
        const noteMatch = (item.note || '').toLowerCase().includes(q);
        const worldIdMatch = (item.worldId || '').toLowerCase().includes(q);

        return nameMatch || locMatch || noteMatch || worldIdMatch;
    });
}
