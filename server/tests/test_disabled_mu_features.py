import unittest

from app.routers.workflow_router import router

REMOVED_MU_ROUTES = {
    "/workflow/{workflow_id}/publish",
    "/workflow/{workflow_id}/template",
    "/cloudfront-signed-url",
    "/architect",
    "/poll-architect/{id}/result",
    "/{workflow_id}/api-inputs",
    "/{workflow_id}/api-execute",
    "/run/{run_id}/api-outputs",
}


class DisabledMuFeatureTests(unittest.TestCase):
    def test_mu_only_routes_are_not_exposed(self):
        active_paths = {route.path for route in router.routes}
        self.assertTrue(REMOVED_MU_ROUTES.isdisjoint(active_paths))


if __name__ == "__main__":
    unittest.main()
