(function() {

    function urlencodeSpecies() {
        /**
         * Replaces whitespaces with underscores in input string (assumed to be a scientific name of species)
         * and converts it to lower case.
         *
         * @param input (string} - capitalized scientific name of a species with whitespaces, e.g. Homo sapiens
         * @returns {string} - scientific name of species with whitespaces replaces with underscores
         */
        return function(input) {
            // Canis familiaris is a special case
            if (input == 'Canis familiaris') {
                input = 'Canis lupus familiaris';
            }
            return input.replace(/ /g, '_').toLowerCase();
        }
    }
    urlencodeSpecies.$inject = [];

    function urldecodeSpecies() {
        /**
         * Replaces underscores with whitespaces in input string and capitalizes the first letter in it.
         *
         * @param input {string} - scientific name of a species in lower case with '_', e.g. homo_sapiens
         * @returns {string} - capitalized scientific name of a species with whitespaces, e.g. Homo sapiens
         */
        return function(input) {
            if (input == 'canis_lupus_familiaris') {
                input = 'canis_familiaris';
            }
            var output = input.replace(/_/g, ' ');
            output = output.charAt(0).toUpperCase() + output.slice(1);
            return output;
        }
    }
    urldecodeSpecies.$inject = [];

    function chrToUCSC() {
        /**
         * UCSC nomencalture for chromosomes is slightly different from Ensembl. This is a converter.
         *
         * @param input {string} Ensembl-style chromosome name, e.g. '21', 'X', 'M' or 'D38368'
         * @returns {string} 'chr21', 'chrX', 'chrY' or 'D38368'
         */
        return function(input) {
            if (input.toString().match(/^\d+$|^[XYM]$/)) {
                return 'chr' + input.toString();
            } else {
                return input.toString();
            }
        }
    }
    chrToUCSC.$inject = [];

    function genoverse($filter, $timeout) {
        /**
         * Returns the directive definition object for genoverse directive.
         * It is meant to be used as follows:
         *
         * <genoverse genome={} chromosome="X" start="1" stop="1000000">
         *     <genoverse-track id="" name="Sequence" info="" label="true"
         *      url-template="{{protocol}}//{{endpoint}}/overlap/region/{{species}}/{{chromosome}}:{{start}}-{{end}}?feature=gene;content-type=application/json"
         *      url-variables="{protocol: 'https', endpoint: 'rest.ensembl.org'">
         *     </genoverse-track>
         * </genoverse>
         */
        return {
            restrict: 'E',
            scope: {
                genome: '=',
                chromosome: '=',
                start: '=',
                end: '='
            },
            transclude: true,
            template:
                "<div class='wrap genoverse-wrap'>" +
                "    <p class='text-muted'>" +
                "        <span id='genomic-location' class='margin-right-5px'></span>" +
                "        View in <a href='http://{{domain}}/{{genome.species | urlencodeSpecies}}/Location/View?r={{chromosome}}:{{start}}-{{end}}' id='ensembl-link' target='_blank'>Ensembl</a>" +
                "        <span ng-show='genome.assembly_ucsc' class='ucsc-link'>|" +
                "            <a href='http://genome.ucsc.edu/cgi-bin/hgTracks?db={{genome.assembly_ucsc}}&position={{chromosome | chrToUCSC}}%3A{{start}}-{{end}}' target='_blank'>UCSC</a>" +
                "        </span>" +
                "    </p>" +
                "<div id='genoverse'></div>" +
                "</div>",
            controller: ['$scope', '$element', '$sttrs', '$transclude', function($scope, $element, $attrs, $transclude) {
                $scope.tracks = [ Genoverse.Track.Scalebar ];

                // Initialization
                // --------------

                render();

                // resize genoverse on browser width changes - attach once only
                $(window).on('resize', setGenoverseWidth);

                // Functions/methods
                // -----------------

                function render() {
                    var genoverseConfig = {
                        container: $element.find('#genoverse'),
                        width: $('.container').width(),
                        // if we want Genoverse itself to update url on scroll, say:
                        urlParamTemplate: false, // or set to: "chromosome=__CHR__&start=__START__&end=__END__",
                        chr: $scope.chromosome,
                        start: $scope.start,
                        end: $scope.end,
                        species: $scope.genome.species,
                        genome: $filter('urlencodeSpecies')($scope.genome.species),
                        plugins: ['controlPanel', 'karyotype', 'resizer', 'fileDrop'],
                        tracks: $scope.tracks
                    };

                    // get domain for Ensembl links
                    $scope.domain = getEnsebmlSubdomainByDivision($scope.genome);

                    // create Genoverse browser
                    $scope.browser = new Genoverse(genoverseConfig);

                    // set browser -> Angular data flow
                    $scope.browser.on({
                        afterInit: function() { // when genoverse is already initialized, attach watches to it
                            // set Genoverse -> Angular data flow
                            $scope.genoverseToAngularWatches = setGenoverseToAngularWatches();

                            // set Angular -> Genoverse data flow
                            $scope.angularToGenoverseWatches = setAngularToGenoverseWatches();

                            $timeout(angular.noop);
                        },

                        // this event is called, whenever the user updates the browser viewport location
                        afterSetRange: function () {
                            // let angular update its model in response to coordinates change
                            // that's an anti-pattern, but no other way to use FRP in angular
                            $timeout(angular.noop);
                        }
                    });
                }

                function setGenoverseToAngularWatches() {
                    var speciesWatch = $scope.$watch('browser.species', function(newValue, oldValue) {
                        $scope.genome = getGenomeByName(newValue);
                        $scope.domain = getEnsebmlSubdomainByDivision($scope.genome);
                    });

                    var chrWatch = $scope.$watch('browser.chr', function(newValue, oldValue) {
                        $scope.chromosome = newValue;
                    });

                    var startWatch = $scope.$watch('browser.start', function(newValue, oldValue) {
                        $scope.start = newValue;
                    });

                    var endWatch = $scope.$watch('browser.end', function(newValue, oldValue) {
                        $scope.end = newValue;
                    });

                    return [speciesWatch, chrWatch, startWatch, endWatch];
                }

                function setAngularToGenoverseWatches() {
                    var startWatch = $scope.$watch('start', function(newValue, oldValue) {
                        if (!angular.equals(newValue, oldValue)) {
                            $scope.browser.moveTo($scope.chromosome, newValue, $scope.end, true);
                        }
                    });

                    var endWatch = $scope.$watch('end', function(newValue, oldValue) {
                        if (!angular.equals(newValue, oldValue)) {
                            $scope.browser.moveTo($scope.chromosome, $scope.start, newValue, true);
                        }
                    });

                    var chrWatch = $scope.$watch('chromosome', function(newValue, oldValue) {
                        if (!angular.equals(newValue, oldValue)) {
                            $scope.browser.moveTo(newValue, $scope.start, $scope.end, true);
                        }
                    });

                    var speciesWatch = $scope.$watch('genome', function(newValue, oldValue) {
                        if (!angular.equals(newValue, oldValue)) {
                            // destroy the old instance of browser and watches
                            $scope.genoverseToAngularWatches.forEach(function (element) { element(); }); // clear old watches
                            $scope.angularToGenoverseWatches.forEach(function (element) { element(); }); // clear old watches
                            $scope.browser.destroy(); // destroy genoverse and all callbacks and ajax requests
                            delete $scope.browser; // clear old instance of browser

                            // set the default location for the browser
                            $scope.chromosome = newValue.example_location.chromosome;
                            $scope.start = newValue.example_location.start;
                            $scope.end = newValue.example_location.end;

                            // create a new instance of browser and set the new watches for it
                            render();
                        }
                    });

                    return [speciesWatch, chrWatch, startWatch, endWatch];
                }

                /**
                 * Maximize Genoverse container width.
                 */
                function setGenoverseWidth() {
                    var w = $('.container').width();
                    $scope.browser.setWidth(w);

                    // resize might change viewport location - digest these changes
                    $timeout(angular.noop)
                }


                // Helper functions
                // ----------------

                /**
                 * Returns an object from genomes Array by its species name or null, if not found.
                 * @param name {string} e.g. "Homo sapiens" or "homo_sapiens" (like in url) or "human" (synonym)
                 * @returns {Object || null} element of genomes Array
                 */
                function getGenomeByName(name) {
                    name = name.replace(/_/g, ' '); // if name was urlencoded, replace '_' with whitespaces

                    for (var i = 0; i < genomes.length; i++) {
                        if (name.toLowerCase() == genomes[i].species.toLowerCase()) { // test scientific name
                            return genomes[i];
                        }
                        else { // if name is not a scientific name, may be it's a synonym?
                            var synonyms = []; // convert all synonyms to lower case to make case-insensitive comparison

                            genomes[i].synonyms.forEach(function(synonym) {
                                synonyms.push(synonym.toLowerCase());
                            });

                            if (synonyms.indexOf(name.toLowerCase()) > -1) return genomes[i];
                        }
                    }

                    return null; // if no match found, return null
                }

                /**
                 * Takes a genome on input, looks into its division attribute and returns the corresponding Ensembl
                 * subdomain
                 *
                 * @param genome {Object} e.g.
                 * {
                 *     'species': 'Mus musculus', 'synonyms': ['mouse'], 'assembly': 'GRCm38', 'assembly_ucsc': 'mm10',
                 *     'taxid': 10090, 'division': 'Ensembl',
                 *     'example_location': {'chromosome': 1, 'start': 86351981, 'end': 86352127,}
                 * }
                 * @returns {String} domain name without protocol or slashes or trailing dots
                 */
                function getEnsebmlSubdomainByDivision(genome) {
                    var subdomain;

                    if (genome.division == 'Ensembl') {
                        subdomain = 'ensembl.org';
                    } else if (genome.division == 'Ensembl Plants') {
                        subdomain = 'plants.ensembl.org';
                    } else if (genome.division == 'Ensembl Metazoa') {
                        subdomain = 'metazoa.ensembl.org';
                    } else if (genome.division == 'Ensembl Bacteria') {
                        subdomain = 'bacteria.ensembl.org';
                    } else if (genome.division == 'Ensembl Fungi') {
                        subdomain = 'fungi.ensembl.org';
                    } else if (genome.division == 'Ensembl Protists') {
                        subdomain = 'protists.ensembl.org';
                    }

                    return subdomain;
                }
            }]
        };
    }
    genoverse.$inject = ['$filter', '$timeout'];

    function genoverseTrack($filter, $timeout) {
        /**
         * Represents a single track within genoverse genome browser.
         */
        return {
            restrict: 'E',
            require: '^genoverse',
            scope: {
                name: '=?',
                labels: '=?',
                model: '=',
                view: '=',
                controller: '=',
                resizable: '=?',
                autoHeight: '=?',
                populateMenu: '=?'
            },
            link: function(scope, element, attrs, genoverseCtrl) {
                // TODO: take the official API documentation and list all the options

                // TODO: validation of incorrect parameter values!
                scope.name = angular.isDefined(scope.name) ? scope.name : '';
                scope.labels = angular.isDefined(scope.labels) ? scope.labels : false;
                scope.resizable = angular.isDefined(scope.resizable) ? scope.name : 'auto';
                scope.autoHeight = angular.isDefined(scope.name) ? scope.name : true;
                scope.populateMenu = angular.isDefined(scope.name) ? scope.name : ;
                // TODO: you can customize how a feature is displayed on different scales by saying e.g. 100000: false

                var track = Genoverse.Track.extend({
                    name: scope.name,
                    labels: scope.labels,
                    model: scope.model,
                    view: scope.view,
                    controller: scope.controller,
                    resizable: scope.resizable,
                    autoHeight: scope.autoHeight,
                    populateMenu: scope.populateMenu
                });

                genoverseCtrl.tracks.push(track);
            }
        };
    }

    angular.module("Genoverse", [])
        .filter("urlencodeSpecies", urlencodeSpecies)
        .filter("urldecodeSpecies", urldecodeSpecies)
        .filter("chrToUCSC", chrToUCSC)
        .directive("genoverse", genoverse)
        .directive("genoverseTrack", genoverseTrack);

})();

