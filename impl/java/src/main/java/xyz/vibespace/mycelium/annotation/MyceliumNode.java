// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium.annotation;

import org.springframework.stereotype.Component;

import java.lang.annotation.*;

/**
 * Marks a Spring bean as a Mycelium agent node.
 *
 * Field note: This annotation is like a spore coat — it tells the Spring
 * container "this bean is part of the organism." The orchestrator scans for
 * these markers during cultivation, wiring each annotated bean into the
 * mycelium network automatically.
 *
 * Usage:
 * <pre>
 * {@literal @}MyceliumNode(id = "auth-agent", scope = "authentication",
 *     capabilities = {"java", "spring-security", "jwt"})
 * public class AuthAgent extends MyceliumAgent { ... }
 * </pre>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Component
public @interface MyceliumNode {

    /**
     * Unique identifier for this agent in the network.
     * Like a species name in a fungal taxonomy — must be unique within the organism.
     */
    String id();

    /**
     * What substrate this agent colonizes — its domain of responsibility.
     */
    String scope();

    /**
     * Enzymes this agent produces — skills it can offer as nutrients to the network.
     * Used by the nutrient flow algorithm to match requests with capable donors.
     */
    String[] capabilities() default {};
}
