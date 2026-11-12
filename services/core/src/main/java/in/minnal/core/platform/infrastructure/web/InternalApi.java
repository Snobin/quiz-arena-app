package in.minnal.core.platform.infrastructure.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a controller as a service-to-service {@code /internal/**} API (AD-12): every handler in it
 * requires the internal service token ({@link InternalTokenInterceptor}).
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface InternalApi {
}
