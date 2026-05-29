import { createClient } from './supabase';

export interface UserProfile {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
}

const supabase = createClient();

/**
 * Fetch user profile by user ID
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Error fetching profile:', error);
        return null;
    }

    return data;
}

/**
 * Update user profile
 */
export async function updateUserProfile(
    userId: string,
    updates: Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>>
): Promise<UserProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

    if (error) {
        console.error('Error updating profile:', error);
        return null;
    }

    return data;
}

/**
 * Create a new profile (usually called automatically via trigger)
 */
export async function createUserProfile(
    userId: string,
    displayName: string,
    avatarUrl?: string
): Promise<UserProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .insert([
            {
                id: userId,
                display_name: displayName,
                avatar_url: avatarUrl,
            },
        ])
        .select()
        .single();

    if (error) {
        console.error('Error creating profile:', error);
        return null;
    }

    return data;
}

/**
 * Update display name only
 */
export async function updateDisplayName(userId: string, displayName: string): Promise<boolean> {
    const { error } = await supabase
        .from('profiles')
        .update({
            display_name: displayName,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

    if (error) {
        console.error('Error updating display name:', error);
        return false;
    }

    return true;
}

/**
 * Update avatar URL only
 */
export async function updateAvatarUrl(userId: string, avatarUrl: string): Promise<boolean> {
    const { error } = await supabase
        .from('profiles')
        .update({
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

    if (error) {
        console.error('Error updating avatar URL:', error);
        return false;
    }

    return true;
}
