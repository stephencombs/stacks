Pod::Spec.new do |s|
  s.name             = 'NativeSearchBar'
  s.version          = '1.0.0'
  s.summary          = 'Native iOS UISearchBar for bottom-pinned search fields'
  s.description      = 'A UISearchBar view with the system clear button, for sheets that pin search above the keyboard.'
  s.author           = 'Color Up'
  s.homepage         = 'https://colorup.app'
  s.platforms        = { :ios => '15.1' }
  s.source           = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
