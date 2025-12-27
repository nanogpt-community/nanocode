import { z } from "zod"
import { Env } from "../env"
import { Auth } from "../auth"
import { Config } from "../config/config"
import { Log } from "../util/log"

const log = Log.create({ service: "nanogpt.account" })

// Zod schemas for API responses
export const Balance = z.object({
    usd_balance: z.string(),
    nano_balance: z.string(),
    nanoDepositAddress: z.string().optional(),
})
export type Balance = z.infer<typeof Balance>

export const SubscriptionUsage = z.object({
    active: z.boolean(),
    limits: z.object({
        daily: z.number(),
        monthly: z.number(),
    }),
    enforceDailyLimit: z.boolean(),
    daily: z.object({
        used: z.number(),
        remaining: z.number(),
        percentUsed: z.number(),
        resetAt: z.number(),
    }),
    monthly: z.object({
        used: z.number(),
        remaining: z.number(),
        percentUsed: z.number(),
        resetAt: z.number(),
    }),
    period: z.object({
        currentPeriodEnd: z.string().nullable(),
    }),
    state: z.enum(["active", "grace", "inactive"]),
    graceUntil: z.string().nullable(),
})
export type SubscriptionUsage = z.infer<typeof SubscriptionUsage>

export namespace NanogptAccount {
    /**
     * Get the NanoGPT API key from env, auth store, or config
     */
    async function getApiKey(): Promise<string | undefined> {
        const env = Env.all()
        const envKey = env["NANOGPT_API_KEY"]
        if (envKey) return envKey

        const auth = await Auth.get("nanogpt")
        if (auth?.type === "api") return auth.key

        const config = await Config.get()
        if (config.provider?.["nanogpt"]?.options?.apiKey) {
            return config.provider["nanogpt"].options.apiKey
        }

        return undefined
    }

    /**
     * Fetch account balance from NanoGPT API
     * POST /api/check-balance
     */
    export async function getBalance(): Promise<Balance | null> {
        try {
            const apiKey = await getApiKey()
            if (!apiKey) {
                log.info("No API key available for balance check")
                return null
            }

            const response = await fetch("https://nano-gpt.com/api/check-balance", {
                method: "POST",
                headers: {
                    "x-api-key": apiKey,
                },
                signal: AbortSignal.timeout(10_000),
            })

            if (!response.ok) {
                log.warn("Balance check failed", { status: response.status })
                return null
            }

            const data = await response.json()
            return Balance.parse(data)
        } catch (e) {
            log.error("Failed to fetch balance", { error: e })
            return null
        }
    }

    /**
     * Fetch subscription usage from NanoGPT API
     * GET /api/subscription/v1/usage
     */
    export async function getSubscriptionUsage(): Promise<SubscriptionUsage | null> {
        try {
            const apiKey = await getApiKey()
            if (!apiKey) {
                log.info("No API key available for subscription usage check")
                return null
            }

            const response = await fetch("https://nano-gpt.com/api/subscription/v1/usage", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: AbortSignal.timeout(10_000),
            })

            if (!response.ok) {
                // 404 or similar means no active subscription - this is normal
                if (response.status === 404 || response.status === 401) {
                    log.info("No subscription found", { status: response.status })
                    return null
                }
                log.warn("Subscription usage check failed", { status: response.status })
                return null
            }

            const data = await response.json()
            return SubscriptionUsage.parse(data)
        } catch (e) {
            log.error("Failed to fetch subscription usage", { error: e })
            return null
        }
    }
}
