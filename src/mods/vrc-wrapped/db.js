// Database queries for the VRChat Wrapped dashboard

/**
 * Gets the top worlds visited by the user within a timeframe.
 */
export async function getTopWorlds(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // gamelog_location tracks the current user's location changes parsed from output logs
    const query = `
        SELECT world_name as worldName, COUNT(*) as visitCount
        FROM gamelog_location
        WHERE created_at >= @timeThreshold AND world_name IS NOT NULL AND world_name != '' AND location != 'private'
        GROUP BY world_name
        ORDER BY visitCount DESC
        LIMIT @limit
    `;
    
    const rows = await ctx.db.query(query, { '@timeThreshold': timeThreshold, '@limit': limit });
    return rows.map(row => ({
        worldName: row[0],
        visitCount: row[1]
    }));
}

/**
 * Gets the most used avatars.
 */
export async function getTopAvatars(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // avatar_history tracks the current user's time spent in avatars
    const query = `
        SELECT cache_avatar.name as avatarName, cache_avatar.thumbnail_image_url as imageUrl, avatar_history.time as timeSpent
        FROM ${ctx.db.corePrefix()}_avatar_history as avatar_history
        JOIN cache_avatar ON avatar_history.avatar_id = cache_avatar.id
        WHERE avatar_history.created_at >= @timeThreshold AND cache_avatar.name IS NOT NULL AND cache_avatar.name != ''
        ORDER BY timeSpent DESC
        LIMIT @limit
    `;
    
    const rows = await ctx.db.query(query, { '@timeThreshold': timeThreshold, '@limit': limit });
    return rows.map(row => ({
        avatarName: row[0],
        imageUrl: row[1],
        switchCount: Math.round((row[2] || 0) / 60) // Converting seconds to minutes for display
    }));
}

/**
 * Gets the top friends the user interacts with (based on online/offline overlap or instance joins).
 */
export async function getTopFriends(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const currentUserId = ctx.stores.user.currentUser?.id || '';
    
    // gamelog_join_leave tracks users joining/leaving the instance you are in
    const query = `
        SELECT display_name as displayName, user_id as userId, COUNT(*) as interactionScore
        FROM gamelog_join_leave
        WHERE created_at >= @timeThreshold AND display_name != '' AND user_id != @currentUserId
        GROUP BY user_id
        ORDER BY interactionScore DESC
        LIMIT @limit
    `;
    
    const rows = await ctx.db.query(query, { '@timeThreshold': timeThreshold, '@limit': limit, '@currentUserId': currentUserId });
    return rows.map(row => ({
        displayName: row[0],
        userId: row[1],
        interactionScore: row[2]
    }));
}

/**
 * Gets an activity heatmap data (count of GPS changes per day).
 */
export async function getActivityHeatmap(ctx, days = 365) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // SQLite: substr(created_at, 1, 10) extracts 'YYYY-MM-DD'
    const query = `
        SELECT substr(created_at, 1, 10) as day, COUNT(*) as count
        FROM gamelog_location
        WHERE created_at >= @timeThreshold
        GROUP BY day
        ORDER BY day ASC
    `;
    
    const rows = await ctx.db.query(query, { '@timeThreshold': timeThreshold });
    return rows.map(row => ({
        day: row[0],
        count: row[1]
    }));
}

/**
 * Gets aggregated summary metrics for the wrapped dashboard.
 */
export async function getSummaryMetrics(ctx, days = 30) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const currentUserId = ctx.stores.user.currentUser?.id || '';
    
    const uniqueWorldsQuery = `SELECT COUNT(DISTINCT world_name) FROM gamelog_location WHERE created_at >= @timeThreshold AND world_name IS NOT NULL AND world_name != ''`;
    const uniqueAvatarsQuery = `SELECT COUNT(DISTINCT avatar_id) FROM ${ctx.db.corePrefix()}_avatar_history WHERE created_at >= @timeThreshold`;
    const interactionsQuery = `SELECT COUNT(*) FROM gamelog_join_leave WHERE created_at >= @timeThreshold AND user_id != @currentUserId`;

    const args = { '@timeThreshold': timeThreshold, '@currentUserId': currentUserId };
    const [worldsRow] = await ctx.db.query(uniqueWorldsQuery, args);
    const [avatarsRow] = await ctx.db.query(uniqueAvatarsQuery, args);
    const [interactionsRow] = await ctx.db.query(interactionsQuery, args);

    return {
        uniqueWorlds: worldsRow ? worldsRow[0] : 0,
        uniqueAvatars: avatarsRow ? avatarsRow[0] : 0,
        interactions: interactionsRow ? interactionsRow[0] : 0
    };
}
