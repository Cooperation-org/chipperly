package org.chipperly.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

/**
 * Covers the one branch that matters for safety: what ChipperlyBlockService
 * lets through regardless of the caregiver's allow-list. Plain JUnit, no
 * Robolectric -- buildAllowSet/shouldBlock take no Android framework types.
 */
public class ChipperlyBlockServiceTest {

    private static final String OWN_PACKAGE = "org.chipperly.app";

    @Test
    public void doesNothingWhenDisabled() {
        Set<String> allow = ChipperlyBlockService.buildAllowSet(OWN_PACKAGE, Collections.<String>emptySet(), null, null);
        assertFalse(ChipperlyBlockService.shouldBlock("com.instagram.android", false, allow));
    }

    @Test
    public void neverBlocksOwnPackage() {
        Set<String> allow = ChipperlyBlockService.buildAllowSet(OWN_PACKAGE, Collections.<String>emptySet(), null, null);
        assertFalse(ChipperlyBlockService.shouldBlock(OWN_PACKAGE, true, allow));
    }

    @Test
    public void neverBlocksDefaultOrEmergencyDialer() {
        Set<String> allow = ChipperlyBlockService.buildAllowSet(OWN_PACKAGE, Collections.<String>emptySet(), "com.google.android.dialer", null);
        assertFalse(ChipperlyBlockService.shouldBlock("com.google.android.dialer", true, allow));
        // com.android.phone (AOSP's in-call/emergency-dialer package) is always allowed, dialer setting or not.
        assertFalse(ChipperlyBlockService.shouldBlock("com.android.phone", true, allow));
    }

    @Test
    public void neverBlocksSystemUiSettingsOrLauncher() {
        Set<String> allow = ChipperlyBlockService.buildAllowSet(OWN_PACKAGE, Collections.<String>emptySet(), null, "com.google.android.launcher");
        assertFalse(ChipperlyBlockService.shouldBlock("com.android.systemui", true, allow));
        assertFalse(ChipperlyBlockService.shouldBlock("com.android.settings", true, allow));
        assertFalse(ChipperlyBlockService.shouldBlock("com.google.android.launcher", true, allow));
    }

    @Test
    public void allowsACaregiverApprovedPackage() {
        Set<String> caregiverAllowed = new HashSet<>();
        caregiverAllowed.add("com.roblox.client");
        Set<String> allow = ChipperlyBlockService.buildAllowSet(OWN_PACKAGE, caregiverAllowed, null, null);
        assertFalse(ChipperlyBlockService.shouldBlock("com.roblox.client", true, allow));
    }

    @Test
    public void blocksAnythingElseWhenEnabled() {
        Set<String> allow = ChipperlyBlockService.buildAllowSet(OWN_PACKAGE, Collections.<String>emptySet(), null, null);
        assertTrue(ChipperlyBlockService.shouldBlock("com.instagram.android", true, allow));
    }
}
