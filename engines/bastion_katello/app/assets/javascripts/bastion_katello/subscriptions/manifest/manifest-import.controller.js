/**
 * @ngdoc object
 * @name  Bastion.subscriptions.controller:ManifestImportController
 *
 * @requires $scope
 * @requires $q
 * @requires translate
 * @requires CurrentOrganization
 * @requires Organization
 * @requires Task
 * @requires Subscription
 * @requires contentDisconnected
 *
 * @description
 *   Controls the import of a manifest.
 */
angular.module('Bastion.subscriptions').controller('ManifestImportController',
    ['$scope', '$q', 'translate', 'CurrentOrganization', 'Organization', 'Task', 'Subscription', 'Notification', 'contentDisconnected',
    function ($scope, $q, translate, CurrentOrganization, Organization, Task, Subscription, Notification, contentDisconnected) {

        function buildManifestLink(upstream) {
            var url = upstream.webUrl,
                upstreamId = upstream.uuid;

            if (!url.match(/^http/)) {
                url = "https://" + url;
            }
            if (!url.match(/\/$/)) {
                url = url + "/";
            }

            url += upstreamId;

            return url;
        }

        function initializeManifestDetails(organization) {
            $scope.details = organization['owner_details'];
            $scope.upstream = $scope.details.upstreamConsumer;

            if (!_.isNull($scope.upstream)) {
                $scope.manifestLink = buildManifestLink($scope.upstream);
                $scope.manifestName = $scope.upstream.name || $scope.upstream.uuid;
            }
        }

        function getInitialTask() {
            return {pending: true};

        }

        $scope.uploadErrorMessages = [];
        $scope.progress = {uploading: false};
        $scope.uploadURL = 'katello/api/v2/organizations/' + CurrentOrganization + '/subscriptions/upload';
        $scope.organization = Organization.get({id: CurrentOrganization});

        $q.all([$scope.organization.$promise]).then(function () {
            $scope.panel.loading = false;
            initializeManifestDetails($scope.organization);
        });

        $scope.$on('$destroy', function () {
            $scope.unregisterSearch();
        });

        $scope.isTaskPending = function () {
            return $scope.task && $scope.task.pending;
        };

        $scope.unregisterSearch = function () {
            Task.unregisterSearch($scope.searchId);
            $scope.searchId = undefined;
        };

        $scope.handleTaskErrors = function (task, errorMessage) {
            var errorMessageWithDetails = errorMessage;
            if (task.result === 'error' || task.result === 'warning') {
                if (task.humanized.output && task.humanized.output.length > 0) {
                    errorMessageWithDetails += ' ' + task.humanized.output;
                }
                if (task.humanized.errors.length > 0) {
                    errorMessageWithDetails += ' ' + task.humanized.errors.join(' ');
                }
                Notification.setErrorMessage(errorMessageWithDetails);
                $scope.histories = Subscription.manifestHistory();
            }
        };

        $scope.updateTask = function (task) {
            $scope.task = task;

            if (!$scope.task.pending) {
                $scope.unregisterSearch();
                if ($scope.task.result === 'success') {
                    $scope.refreshOrganizationInfo();
                    Notification.setSuccessMessage(translate("Manifest successfully imported."));
                } else {
                    $scope.handleTaskErrors(task, translate("Error importing manifest."));
                }
            }
        };

        $scope.deleteManifest = function () {
            $scope.task = getInitialTask();
            $scope.taskStatusText = translate('Removing Manifest');
            Subscription.deleteManifest({}, function (returnData) {
                $scope.task = returnData;
                $scope.searchId = Task.registerSearch({'type': 'task', 'task_id': $scope.task.id}, $scope.deleteManifestTask);
            }, function (response) {
                $scope.saveError = true;
                $scope.errors = response.data.errors;
            });
        };

        $scope.deleteManifestTask = function (task) {
            $scope.task = task;
            if (!$scope.task.pending) {
                $scope.unregisterSearch();
                if ($scope.task.result === 'success') {
                    $scope.saveSuccess = true;
                    Notification.setSuccessMessage(translate("Manifest successfully deleted."));
                    $scope.refreshOrganizationInfo();
                } else {
                    $scope.handleTaskErrors(task, translate("Error deleting manifest."));
                }
            }
        };

        $scope.refreshOrganizationInfo = function () {
            $scope.organization = Organization.get({id: CurrentOrganization});
            $q.all([$scope.organization.$promise]).then(function () {
                initializeManifestDetails($scope.organization);
            });
            $scope.histories = Subscription.manifestHistory();
        };

        $scope.refreshManifest = function () {
            $scope.task = getInitialTask();
            $scope.taskStatusText = translate('Refreshing Manifest');
            Subscription.refreshManifest({}, function (returnData) {
                $scope.task = returnData;
                $scope.searchId = Task.registerSearch({'type': 'task', 'task_id': $scope.task.id}, $scope.refreshManifestTask);
            }, function (response) {
                $scope.saveError = true;
                $scope.errors = response.data.errors;
            });
        };

        $scope.refreshManifestTask = function (task) {
            $scope.task = task;
            if (!$scope.task.pending) {
                $scope.unregisterSearch();
                if ($scope.task.result === 'success') {
                    $scope.saveSuccess = true;
                    Notification.setSuccessMessage(translate("Manifest successfully refreshed."));
                    $scope.refreshOrganizationInfo();
                } else {
                    $scope.handleTaskErrors(task, translate("Error refreshing manifest."));
                }
            }
        };

        $scope.saveCdnUrl = function (organization) {
            var deferred;

            // @TODO hack needed to prevent upload of fields users, parent_name, and parent_id
            // http://projects.theforeman.org/issues/12894
            var whitelistedOrganizationObject = {},
                whitelist = [
                    "id",
                    "redhat_repository_url"
                ];

            angular.forEach(whitelist, function (key) {
                whitelistedOrganizationObject[key] = organization[key];
            });

            deferred = Organization.update(whitelistedOrganizationObject, function () {
                Notification.setSuccessMessage(translate('Repository URL updated'));
                $scope.refreshOrganizationInfo();
            }, function (response) {
                angular.forEach(response.data.error['full_messages'], function (message) {
                    Notification.setErrorMessage(translate("An error occurred saving the URL: ") + message);
                });
            });

            return deferred.$promise;
        };

        $scope.uploadManifest = function (content) {
            var returnData;
            if (content) {
                $scope.task = getInitialTask();
                $scope.taskStatusText = translate('Uploading Manifest');

                try {
                    returnData = angular.fromJson(angular.element(content).html());
                } catch (err) {
                    returnData = content;
                }

                if (!returnData) {
                    returnData = content;
                }

                if (returnData !== null && angular.isUndefined(returnData.errors)) {
                    $scope.task = returnData;
                    $scope.searchId = Task.registerSearch({'type': 'task', 'task_id': $scope.task.id}, $scope.updateTask);
                } else {
                    $scope.uploadErrorMessages = [translate('Error during upload: ') + returnData.displayMessage];
                }

                $scope.progress.uploading = false;
            }
        };

        $scope.uploadError = function (error, content) {
            if (angular.isString(content) && content.indexOf("Request Entity Too Large")) {
                error = translate('File too large.');
            } else {
                error = content;
            }
            $scope.uploadErrorMessages = [translate('Error during upload: ') + error];
            $scope.progress.uploading = false;
        };

        $scope.histories = Subscription.manifestHistory();

        $scope.showHistoryMoreLink = false;

        $scope.truncateHistories = function (histories) {
            var numToDisplay = 4;
            var result = [];
            angular.forEach(histories, function (history, index) {
                if (index < numToDisplay) {
                    result.push(history);
                }
            });
            return result;
        };

        $scope.isTruncated = function (subset, set) {
            return subset.length < set.length;
        };

        $scope.$watch('histories', function (changes) {
            changes.$promise.then(function (results) {
                $scope.statuses = $scope.truncateHistories(results);
                $scope.showHistoryMoreLink = $scope.isTruncated($scope.statuses, results);
            });
        });

        $scope.manifestRefreshDisabled = function () {
          return $scope.isTaskPending() ||
                 !$scope.upstream ||
                 !$scope.upstream.idCert ||
                 !$scope.upstream.idCert.cert ||
                 contentDisconnected
        }
    }]
);
