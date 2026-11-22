Pod::Spec.new do |s|
  s.name             = 'AppleMapsSearch'
  s.version          = '1.0.0'
  s.summary          = 'Native iOS MKLocalSearch wrapper for casino discovery'
  s.description      = 'Runs on-device Apple Maps MKLocalSearch queries for casinos on iOS.'
  s.author           = 'Color Up'
  s.homepage         = 'https://colorup.app'
  s.platforms        = { :ios => '15.1' }
  s.source           = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
