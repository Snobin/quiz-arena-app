# syntax=docker/dockerfile:1
# Build context: repository root (see deploy/compose.yaml).

FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY contracts/pom.xml contracts/
COPY services/core/pom.xml services/core/
COPY services/game/pom.xml services/game/
COPY services/ratings/pom.xml services/ratings/
COPY contracts/src contracts/src
COPY services/game/src services/game/src
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw -q -B -pl services/game -am -DskipTests package

FROM eclipse-temurin:25-jre
# curl is used only by the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system minnal \
    && useradd --system --gid minnal --no-create-home --shell /usr/sbin/nologin minnal
WORKDIR /app
COPY --from=build /src/services/game/target/game-service.jar app.jar
USER minnal
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
