// Database queries for the VRChat Wrapped dashboard

/**
 * Gets the top worlds visited by the user within a timeframe.
 */
export async function getTopWorlds(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // _feed_gps tracks location changes. 
    // We group by location and count. 
    // 'location' is usually the world ID or name in VRCX depending on the log type, 
    // but typically it contains the World Name as a string in standard GPS feed.
    const query = `
        SELECT location as worldName, COUNT(*) as visitCount
        FROM ${ctx.db.corePrefix()}_feed_gps
        WHERE created_at >= ?
        GROUP BY location
        ORDER BY visitCount DESC
        LIMIT ?
    `;
    
    return await ctx.db.query(query, [timeThreshold, limit]);
}

/**
 * Gets the most used avatars.
 */
export async function getTopAvatars(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // _feed_avatar tracks avatar changes
    const query = `
        SELECT avatar_name as avatarName, avatar_image_url as imageUrl, COUNT(*) as switchCount
        FROM ${ctx.db.corePrefix()}_feed_avatar
        WHERE created_at >= ?
        GROUP BY avatar_id
        ORDER BY switchCount DESC
        LIMIT ?
    `;
    
    return await ctx.db.query(query, [timeThreshold, limit]);
}

/**
 * Gets the top friends the user interacts with (based on online/offline overlap or instance joins).
 * For simplicity, we just look at who was seen online the most frequently or joins the same GPS instances.
 * Actually, VRCX has _feed_online_offline.
 */
export async function getTopFriends(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // We count how many times a friend triggered an online/location event
    const query = `
        SELECT display_name as displayName, user_id as userId, COUNT(*) as interactionScore
        FROM ${ctx.db.corePrefix()}_feed_online_offline
        WHERE created_at >= ?
        GROUP BY user_id
        ORDER BY interactionScore DESC
        LIMIT ?
    `;
    
    return await ctx.db.query(query, [timeThreshold, limit]);
}

/**
 * Gets an activity heatmap data (count of GPS changes per day).
 */
export async function getActivityHeatmap(ctx, days = 365) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // SQLite: substr(created_at, 1, 10) extracts 'YYYY-MM-DD'
    const query = `
        SELECT substr(created_at, 1, 10) as day, COUNT(*) as count
        FROM ${ctx.db.corePrefix()}_feed_gps
        WHERE created_at >= ?
        GROUP BY day
        ORDER BY day ASC
    `;
    
    return await ctx.db.query(query, [timeThreshold]);
}
