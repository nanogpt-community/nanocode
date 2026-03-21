import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import { QuestionID } from "@/question/schema"
import { Question as QuestionSchema } from "@/question/service"
import z from "zod"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { runPromiseInstance } from "@/effect/runtime"

export const QuestionRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List pending questions",
        description: "Get all pending question requests across all sessions.",
        operationId: "question.list",
        responses: {
          200: {
            description: "List of pending questions",
            content: {
              "application/json": {
                schema: resolver(z.array(QuestionSchema.Request)),
              },
            },
          },
        },
      }),
      async (c) => {
        const questions = await runPromiseInstance(QuestionSchema.Service.use((svc) => svc.list()))
        return c.json(questions)
      },
    )
    .post(
      "/:requestID/reply",
      describeRoute({
        summary: "Reply to question request",
        description: "Provide answers to a question request from the AI assistant.",
        operationId: "question.reply",
        responses: {
          200: {
            description: "Question answered successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          requestID: QuestionID.zod,
        }),
      ),
      validator("json", QuestionSchema.Reply),
      async (c) => {
        const params = c.req.valid("param")
        const json = c.req.valid("json")
        await runPromiseInstance(
          QuestionSchema.Service.use((svc) =>
            svc.reply({
              requestID: params.requestID,
              answers: json.answers,
            }),
          ),
        )
        return c.json(true)
      },
    )
    .post(
      "/:requestID/reject",
      describeRoute({
        summary: "Reject question request",
        description: "Reject a question request from the AI assistant.",
        operationId: "question.reject",
        responses: {
          200: {
            description: "Question rejected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          requestID: QuestionID.zod,
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await runPromiseInstance(QuestionSchema.Service.use((svc) => svc.reject(params.requestID)))
        return c.json(true)
      },
    ),
)
