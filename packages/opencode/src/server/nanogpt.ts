import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import z from "zod"
import { errors } from "./error"
import { Auth } from "../auth"

export const NanogptRoute = new Hono()
    .get(
        "@nanogpt/models/:id/providers",
        describeRoute({
            summary: "Discover Providers and Pricing",
            description: "List available providers and the pricing you will pay when selecting one.",
            operationId: "models.providers",
            responses: {
                200: {
                    description: "Providers list",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.object({
                                    canonicalId: z.string(),
                                    displayName: z.string(),
                                    supportsProviderSelection: z.boolean(),
                                    defaultPrice: z.object({
                                        inputPer1kTokens: z.number(),
                                        outputPer1kTokens: z.number(),
                                    }),
                                    providers: z.array(
                                        z.object({
                                            provider: z.string(),
                                            pricing: z.object({
                                                inputPer1kTokens: z.number(),
                                                outputPer1kTokens: z.number(),
                                            }),
                                            available: z.boolean(),
                                        }),
                                    ),
                                }),
                            ),
                        },
                    },
                },
                ...errors(400, 401, 404),
            },
        }),
        async (c) => {
            const id = c.req.param("id")
            const auth = await Auth.get("nanogpt")
            const key = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : process.env.NANOGPT_API_KEY
            if (!key) return c.json({ error: "Unauthorized", message: "NanoGPT API key not found" }, 401)

            const res = await fetch(`https://nano-gpt.com/api/models/${encodeURIComponent(id)}/providers`, {
                headers: { Authorization: `Bearer ${key}` },
            })

            if (!res.ok) {
                const text = await res.text()
                try {
                    const json = JSON.parse(text)
                    return c.json(json, res.status as any)
                } catch {
                    return c.json({ error: "Upstream error", message: text }, res.status as any)
                }
            }

            return c.json(await res.json())
        },
    )
    .get(
        "@nanogpt/user/provider-preferences",
        describeRoute({
            summary: "Get Persistent Provider Preferences",
            description: "Get saved provider preferences.",
            operationId: "user.providerPreferences.get",
            responses: {
                200: {
                    description: "Provider preferences",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.object({
                                    preferredProviders: z.array(z.string()).optional(),
                                    excludedProviders: z.array(z.string()).optional(),
                                    enableFallback: z.boolean(),
                                    modelOverrides: z
                                        .record(
                                            z.string(),
                                            z.object({
                                                preferredProviders: z.array(z.string()).optional(),
                                                enableFallback: z.boolean().optional(),
                                            }),
                                        )
                                        .optional(),
                                    availableProviders: z.array(z.string()).optional(),
                                }),
                            ),
                        },
                    },
                },
                ...errors(401),
            },
        }),
        async (c) => {
            const auth = await Auth.get("nanogpt")

            // API Key users cannot have server-side session preferences
            if (auth?.type === "api") {
                return c.json({
                    preferredProviders: [],
                    excludedProviders: [],
                    enableFallback: true,
                    modelOverrides: {}
                })
            }

            const key = auth?.type === "oauth" ? auth.access : undefined
            if (!key) return c.json({ error: "Unauthorized", message: "NanoGPT session not found" }, 401)

            const res = await fetch(`https://nano-gpt.com/api/user/provider-preferences`, {
                headers: { Authorization: `Bearer ${key}` },
            })

            if (!res.ok) {
                const text = await res.text()
                try {
                    const json = JSON.parse(text)
                    return c.json(json, res.status as any)
                } catch {
                    return c.json({ error: "Upstream error", message: text }, res.status as any)
                }
            }

            return c.json(await res.json())
        },
    )
    .patch(
        "@nanogpt/user/provider-preferences",
        describeRoute({
            summary: "Update Persistent Provider Preferences",
            description: "Update saved provider preferences.",
            operationId: "user.providerPreferences.update",
            responses: {
                200: {
                    description: "Updated preferences",
                    content: { "application/json": { schema: resolver(z.any()) } },
                },
                ...errors(400, 401, 422),
            },
        }),
        validator(
            "json",
            z.object({
                preferredProviders: z.array(z.string()).optional(),
                excludedProviders: z.array(z.string()).optional(),
                enableFallback: z.boolean().optional(),
                modelOverrides: z
                    .record(
                        z.string(),
                        z.object({
                            preferredProviders: z.array(z.string()).optional(),
                            enableFallback: z.boolean().optional(),
                        }),
                    )
                    .optional(),
            }),
        ),
        async (c) => {
            const body = c.req.valid("json")
            const auth = await Auth.get("nanogpt")

            // API Key users cannot have server-side session preferences
            if (auth?.type === "api") {
                // For now, we just return success but don't persist anything
                return c.json({})
            }

            const key = auth?.type === "oauth" ? auth.access : undefined
            if (!key) return c.json({ error: "Unauthorized", message: "NanoGPT session not found" }, 401)

            const res = await fetch(`https://nano-gpt.com/api/user/provider-preferences`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            })

            if (!res.ok) {
                const text = await res.text()
                try {
                    const json = JSON.parse(text)
                    return c.json(json, res.status as any)
                } catch {
                    return c.json({ error: "Upstream error", message: text }, res.status as any)
                }
            }

            return c.json(await res.json())
        },
    )
    .delete(
        "@nanogpt/user/provider-preferences",
        describeRoute({
            summary: "Delete Persistent Provider Preferences",
            description: "Clear saved provider preferences.",
            operationId: "user.providerPreferences.delete",
            responses: {
                200: {
                    description: "Preferences cleared",
                    content: { "application/json": { schema: resolver(z.any()) } },
                },
                ...errors(401),
            },
        }),
        async (c) => {
            const auth = await Auth.get("nanogpt")

            // API Key users cannot have server-side session preferences
            if (auth?.type === "api") {
                // Silently fail/succeed since we can't delete what doesn't exist
                return c.json({})
            }

            const key = auth?.type === "oauth" ? auth.access : undefined
            if (!key) return c.json({ error: "Unauthorized", message: "NanoGPT session not found" }, 401)

            const res = await fetch(`https://nano-gpt.com/api/user/provider-preferences`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${key}` },
            })

            if (!res.ok) {
                const text = await res.text()
                try {
                    const json = JSON.parse(text)
                    return c.json(json, res.status as any)
                } catch {
                    return c.json({ error: "Upstream error", message: text }, res.status as any)
                }
            }

            return c.json(await res.json())
        },
    )
