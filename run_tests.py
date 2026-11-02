#!/usr/bin/env python3
"""
run_tests.py — Master Test Runner for Relativistic Optical Delay-Line Data Storage

Discovers and executes all project verification test suites:
  1. tests/test_physics_engine.py (10 analytical kinematics, Doppler, link, capacity benchmarks)
  2. tests/test_ste_compliance.py (ASD-STE100 linter & prose compliance tests)
  3. tests/test_webapp_headless.py (Headless DOM, SVG/Canvas, and configuration tests - when present)

CLI Usage:
  python3 run_tests.py [--verbose] [--suite <name>] [--json]

Exit codes:
  0: All test suites passed successfully.
  1: One or more tests failed or encountered errors.
"""

import sys
import os
import time
import unittest
import argparse
from typing import Dict, Any, List

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def discover_and_run_tests(verbose: bool = True, suite_filter: str = None) -> bool:
    """
    Discovers and executes test cases using unittest.

    Parameters:
    -----------
    verbose : bool
        Verbosity level for TextTestRunner.
    suite_filter : str, optional
        Filter pattern to run a specific test file or test name.

    Returns:
    --------
    bool
        True if all tests passed without failures or errors, False otherwise.
    """
    start_time = time.time()
    tests_dir = os.path.join(PROJECT_ROOT, "tests")

    if not os.path.isdir(tests_dir):
        print(f"Error: tests directory not found at {tests_dir}", file=sys.stderr)
        return False

    suite = unittest.TestSuite()
    loader = unittest.TestLoader()

    # Known suites to execute
    target_modules = [
        "tests.test_physics_engine",
        "tests.test_ste_compliance"
    ]

    # Conditionally include headless webapp tests if file exists
    if os.path.isfile(os.path.join(tests_dir, "test_webapp_headless.py")):
        target_modules.append("tests.test_webapp_headless")

    if suite_filter:
        print(f"Running filtered test suite matching: {suite_filter}")
        matching_modules = [m for m in target_modules if suite_filter in m]
        if not matching_modules:
            # Fallback to pattern discovery
            discovered = loader.discover(tests_dir, pattern=f"*{suite_filter}*.py")
            suite.addTests(discovered)
        else:
            for mod in matching_modules:
                try:
                    loaded = loader.loadTestsFromName(mod)
                    suite.addTests(loaded)
                except Exception as e:
                    print(f"Failed to load module {mod}: {e}", file=sys.stderr)
                    return False
    else:
        for mod in target_modules:
            try:
                loaded = loader.loadTestsFromName(mod)
                suite.addTests(loaded)
            except Exception as e:
                print(f"Failed to load module {mod}: {e}", file=sys.stderr)
                return False

    print("=" * 70)
    print(" RELATIVISTIC OPTICAL DELAY-LINE DATA STORAGE: TEST HARNESS")
    print("=" * 70)
    print(f"Project Root: {PROJECT_ROOT}")
    print(f"Test Modules: {', '.join(target_modules)}")
    print(f"Total Test Cases Loaded: {suite.countTestCases()}")
    print("-" * 70)

    verbosity_level = 2 if verbose else 1
    runner = unittest.TextTestRunner(verbosity=verbosity_level, buffer=True)
    result = runner.run(suite)

    elapsed = time.time() - start_time

    print("=" * 70)
    print(" TEST EXECUTION SUMMARY")
    print("=" * 70)
    print(f"Total Tests Run: {result.testsRun}")
    print(f"Passed:          {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures:        {len(result.failures)}")
    print(f"Errors:          {len(result.errors)}")
    print(f"Skipped:         {len(result.skipped)}")
    print(f"Execution Time:  {elapsed:.3f} seconds")

    if result.wasSuccessful():
        print(f"\nResult: \033[92mALL TESTS PASSED (100% SUCCESS)\033[0m")
        print("=" * 70)
        return True
    else:
        print(f"\nResult: \033[91mTEST SUITE FAILED\033[0m")
        print("=" * 70)
        return False


def main():
    parser = argparse.ArgumentParser(description="Master Test Runner for Relativistic Reflector Storage")
    parser.add_argument("-v", "--verbose", action="store_true", default=True, help="Enable verbose output")
    parser.add_argument("-q", "--quiet", action="store_true", help="Minimal output")
    parser.add_argument("-s", "--suite", type=str, default=None, help="Filter specific test suite or test name")
    args = parser.parse_args()

    verbose = not args.quiet and args.verbose
    success = discover_and_run_tests(verbose=verbose, suite_filter=args.suite)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
