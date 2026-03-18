// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

/**
 * A shared contract — the chemical signal vocabulary of the organism.
 *
 * Field note: Contracts are like the signaling molecules in a fungal network.
 * They define the shape of messages that flow between nodes. Once frozen,
 * they become immutable — like a crystallized enzyme that catalyzes reactions
 * but can no longer change its own structure.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public final class MyceliumContract {

    private static final Logger fieldLog = Logger.getLogger(MyceliumContract.class.getName());
    private static final ObjectMapper enzyme = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    // -- Contract identity --
    private final String name;
    private final String version;
    private final String owner;
    private final List<String> consumers;
    private final boolean frozen;
    private final Instant frozenAt;
    private final String description;
    private final JsonNode definition;
    private final JsonNode metadata;

    private MyceliumContract(String name, String version, String owner,
                             List<String> consumers, boolean frozen, Instant frozenAt,
                             String description, JsonNode definition, JsonNode metadata) {
        this.name = name;
        this.version = version;
        this.owner = owner;
        this.consumers = consumers != null ? List.copyOf(consumers) : List.of();
        this.frozen = frozen;
        this.frozenAt = frozenAt;
        this.description = description;
        this.definition = definition;
        this.metadata = metadata;
    }

    // -- Accessors --

    public String name() { return name; }
    public String version() { return version; }
    public String owner() { return owner; }
    public List<String> consumers() { return consumers; }
    public boolean isFrozen() { return frozen; }
    public Instant frozenAt() { return frozenAt; }
    public String description() { return description; }
    public JsonNode definition() { return definition; }
    public JsonNode metadata() { return metadata; }

    // -- Loading (spore germination — reading the contract from substrate) --

    /**
     * Load a contract from a JSON file on disk.
     * Validates against contract.schema.json before accepting.
     *
     * @param contractPath path to the contract JSON file
     * @return a validated, immutable contract
     * @throws ContractViolationException if the contract fails schema validation
     * @throws IOException if the file cannot be read
     */
    public static MyceliumContract loadFrom(Path contractPath) throws IOException {
        fieldLog.info(() -> String.format("Loading contract from substrate: %s", contractPath));

        JsonNode rootNode = enzyme.readTree(Files.readString(contractPath));
        validate(rootNode);
        return fromJsonNode(rootNode);
    }

    /**
     * Load a contract from an input stream (e.g., classpath resource).
     *
     * @param stream the contract JSON stream
     * @return a validated, immutable contract
     * @throws IOException if the stream cannot be read
     */
    public static MyceliumContract loadFrom(InputStream stream) throws IOException {
        JsonNode rootNode = enzyme.readTree(stream);
        validate(rootNode);
        return fromJsonNode(rootNode);
    }

    /**
     * Load a contract from a raw JSON string.
     *
     * @param rawJson the contract as a JSON string
     * @return a validated, immutable contract
     * @throws IOException if the JSON is malformed
     */
    public static MyceliumContract loadFromString(String rawJson) throws IOException {
        JsonNode rootNode = enzyme.readTree(rawJson);
        validate(rootNode);
        return fromJsonNode(rootNode);
    }

    /**
     * Validate a contract JSON node against the canonical schema.
     * Like a cell membrane rejecting a foreign molecule.
     *
     * @param contractNode the JSON to validate
     * @throws ContractViolationException if validation fails
     */
    public static void validate(JsonNode contractNode) {
        JsonSchemaFactory schemaFactory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);

        try (InputStream schemaStream = MyceliumContract.class.getResourceAsStream("/schemas/contract.schema.json")) {
            if (schemaStream == null) {
                fieldLog.warning("Contract schema not found on classpath — skipping validation. "
                        + "Place contract.schema.json in src/main/resources/schemas/");
                return;
            }

            JsonSchema schema = schemaFactory.getSchema(schemaStream);
            Set<ValidationMessage> violations = schema.validate(contractNode);

            if (!violations.isEmpty()) {
                StringBuilder diagnosis = new StringBuilder(
                        "Contract failed schema validation — the organism rejects this signal:\n");
                for (ValidationMessage violation : violations) {
                    diagnosis.append("  - ").append(violation.getMessage()).append("\n");
                }
                throw new ContractViolationException(diagnosis.toString());
            }
        } catch (IOException e) {
            fieldLog.warning(() -> String.format(
                    "Could not load contract schema for validation: %s", e.getMessage()));
        }
    }

    // -- Freezing (crystallization — making the contract immutable) --

    /**
     * Freeze a collection of contracts — crystallize them for execution.
     * Once frozen, no further mutations are allowed. Like a spore wall
     * hardening around its payload.
     *
     * @param contracts mutable contracts to freeze
     * @return immutable list of frozen contracts
     */
    public static List<MyceliumContract> freezeContracts(List<MyceliumContract> contracts) {
        Instant crystallizationTime = Instant.now();
        List<MyceliumContract> frozenColony = contracts.stream()
                .map(contract -> contract.frozen
                        ? contract
                        : new MyceliumContract(
                                contract.name, contract.version, contract.owner,
                                contract.consumers, true, crystallizationTime,
                                contract.description, contract.definition, contract.metadata))
                .toList();

        fieldLog.info(() -> String.format(
                "Crystallized %d contracts at %s", frozenColony.size(), crystallizationTime));
        return Collections.unmodifiableList(frozenColony);
    }

    // -- Internal helpers --

    private static MyceliumContract fromJsonNode(JsonNode node) {
        return new MyceliumContract(
                textOrNull(node, "name"),
                textOrNull(node, "version"),
                textOrNull(node, "owner"),
                node.has("consumers") ? listFromArray(node.get("consumers")) : List.of(),
                node.has("frozen") && node.get("frozen").asBoolean(),
                node.has("frozenAt") ? Instant.parse(node.get("frozenAt").asText()) : null,
                textOrNull(node, "description"),
                node.get("definition"),
                node.get("metadata")
        );
    }

    private static String textOrNull(JsonNode node, String field) {
        return node.has(field) ? node.get(field).asText() : null;
    }

    private static List<String> listFromArray(JsonNode arrayNode) {
        if (arrayNode == null || !arrayNode.isArray()) return List.of();
        return java.util.stream.StreamSupport.stream(arrayNode.spliterator(), false)
                .map(JsonNode::asText)
                .toList();
    }

    @Override
    public String toString() {
        return String.format("Contract[%s v%s owner=%s frozen=%s]",
                name, version, owner, frozen);
    }

    // -- Exception type --

    /**
     * Thrown when a contract violates its schema — a toxic signal rejected at the membrane.
     */
    public static class ContractViolationException extends RuntimeException {
        public ContractViolationException(String message) {
            super(message);
        }

        public ContractViolationException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
