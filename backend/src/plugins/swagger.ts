import type { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { logger } from "#utils/logger";

/**
 * OpenAPI documentation via Fastify Swagger.
 * Uses "dynamic" mode: reads route schemas at runtime and builds the spec.
 */
export async function registerSwagger(server: FastifyInstance) {
  await server.register(fastifySwagger, {
    mode: "dynamic",
    swagger: {
      info: {
        title: "Bourse Radar API",
        description:
          "Quantitative Tehran Stock Exchange ranking engine. " +
          "NOT investment advice.",
        version: "0.1.0",
        contact: {
          name: "Bourse Radar",
          url: "https://bourse-radar.ir",
        },
      },
      host: "localhost:8000",
      schemes: ["http"],
    },
  });

  await server.register(fastifySwaggerUI, {
    routePrefix: "/docs",
    swagger: {
      info: {
        title: "Bourse Radar API",
        description: "Quantitative Tehran Stock Exchange ranking engine.",
        version: "0.1.0",
      },
    },
    staticCSP: false,
    transformStaticCSP: (req) => ({ provider: req.isSecure() }),
    transform: (oP) => {
      const result = { ...oP };
      if (!result.definition || !result.definition.components) {
        result.definition = { ...result.definition, components: {} };
      }
      result.definition.components = {
        securitySchemes: {
          apiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
        },
        ...result.definition.components,
      };
      return result;
    },
  });

  logger.info("✓ Swagger UI at http://localhost:8000/docs");
}
