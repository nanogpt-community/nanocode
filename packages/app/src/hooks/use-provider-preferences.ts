import { createStore } from "solid-js/store"
import { persisted } from "@/utils/persist"

export interface ProviderPreferences {
    preferredProviders?: string[]
    excludedProviders?: string[]
    enableFallback: boolean
    modelOverrides?: Record<string, {
        preferredProviders?: string[]
        enableFallback?: boolean
    }>
    availableProviders?: string[]
}

const DEFAULT_PREFERENCES: ProviderPreferences = {
    preferredProviders: [],
    excludedProviders: [],
    enableFallback: true,
    modelOverrides: {},
    availableProviders: []
}

export function useProviderPreferences() {
    const [preferences, setPreferences] = persisted<ProviderPreferences>(
        "provider-preferences.v1",
        createStore(DEFAULT_PREFERENCES)
    )

    const getPreferencesForModel = (modelId: string) => {
        const override = preferences.modelOverrides?.[modelId]
        const globalPreferred = preferences.preferredProviders || []

        return {
            preferredProviders: override?.preferredProviders ?? globalPreferred,
            enableFallback: override?.enableFallback ?? preferences.enableFallback ?? true
        }
    }

    const setPreferencesForModel = (modelId: string, prefs: { preferredProviders: string[], enableFallback: boolean }) => {
        setPreferences("modelOverrides", modelId, prefs)
    }

    return {
        preferences,
        setPreferences,
        getPreferencesForModel,
        setPreferencesForModel
    }
}
